import {
    BehaviorSubject,
    concat,
    EMPTY,
    merge,
    Observable,
    of,
    OperatorFunction, race,
    ReplaySubject,
    Subject,
    throwError
} from 'rxjs';
import {
    catchError,
    distinctUntilChanged, endWith,
    filter, finalize,
    flatMap, ignoreElements,
    map,
    mapTo,
    mergeAll,
    mergeMap,
    scan,
    share, shareReplay,
    switchMap, takeUntil, tap
} from 'rxjs/operators';
import {fromArray} from 'rxjs/internal/observable/fromArray';

/**
 * Defines callback which applied while choosing which elements are passing into filtered reactive-subset
 *
 * @typeParam T - Defines element type of base reactive-set
 * @typeParam R - Defines element type of sub reactive-set
 */
export interface FilterPredicate<T, R extends T> {
    /**
     * @param entry - Takes element from base reactive-set to check if that if it is filtered or not.
     * @returns Returns a boolean which filters element in or out. Or returns an reactive boolean result which decides element's existence in sub-set, and it can be actively changed in time
     */
    (entry: T): boolean | Observable<boolean>;
}

/**
 * Defines callback which applied while converting elements to desired type before adding into mapped reactive-set
 *
 * @typeParam T - Defines element type of base reactive-set
 * @typeParam R - Defines element type of mapped reactive-set
 */
export interface ConverterFunction<T, R> {
    /**
     * @param entry - Takes element from base reactive-set to convert to desired type.
     * @returns Returns a reactive conversion result from T to R, and it can be actively changed in time
     */
    (entry: T): Observable<R>;
}

/**
 * Defines fields and methods which required to implement an essential readonly-reactive-set
 *
 * @typeParam T - Type of the elements in reactive-set
 */
export interface ReadonlyReactiveSet<T> {
    /**
     * Add-stream: Emits added entries by subsequent add operations after subscribe
     */
    readonly add$: Observable<T>;

    /**
     * Add-stream: Emits removed entries by subsequent remove operations after subscribe
     */
    readonly remove$: Observable<T>;

    /**
     * In-stream: Emits currently included entries on subscribe and added entries by subsequent add operations after subscribe
     */
    readonly in$: Observable<T>;

    /**
     * Emits flat version of live reactive-set. Every emitted set is different objects.
     */
    readonly flat$: Observable<ReadonlySet<T>>;

    /**
     * Returns a reactive-stream which emits entry's current and future statuses
     * @param entry - Entry to check if it is in the set or not
     *
     * @returns Reactive-stream which emits entry's current and future statuses
     */
    has$(entry: T): Observable<boolean>;

    /**
     * Length-stream: Emits current length and keeps emitting lengths on changes by subsequent mutation operations
     */
    length$: Observable<number>;

    /**
     * Returns a READONLY reactive-subset which is filtered by the predicate function
     *
     * @typeParam R - Desired element type (which extends element type T of main set) of filtered subset
     *
     * @param predicate - Predicate function to filter source reactive-set
     * @returns Filtered reactive-subset of this reactive-set
     *
     * @beta
     */
    filter<R extends T>(predicate: FilterPredicate<T, R>): ReadonlyReactiveSet<R>;

    /**
     * Returns a READONLY reactive-set which is mapped using the converter function
     *
     * @typeParam R - Desired element type of mapped set
     *
     * @param converter - Converter function to map source reactive-set
     * @returns Mapped reactive-set of this reactive-set
     *
     * @beta
     */
    map<R>(converter: ConverterFunction<T, R>): ReadonlyReactiveSet<R>;
}

/**
 * @internal
 */
function flatten<T>(
    in$: Observable<T>, remove$: Observable<T>
): Observable<ReadonlySet<T>> {
    return new Observable<Set<T>>(subscriber => {
        const clean$ = new ReplaySubject<void>(1);

        const set = new Set<T>();

        subscriber.next(set);

        merge(
            in$.pipe(map(element => ({type: 'in' as const, element}))),
            remove$.pipe(map(element => ({type: 'remove' as const, element}))),
        ).pipe(
            takeUntil(clean$)
        ).subscribe(
            event => {
                if (event.type === 'in') {
                    set.add(event.element);
                } else if (event.type === 'remove') {
                    set.delete(event.element);
                } else {
                    throw new Error('bug.');
                }
                subscriber.next(set);
            }
        );

        return () => clean$.complete();
    }).pipe(shareReplay(1), map(set => new Set<T>(set)));
}

/**
 * @internal
 */
abstract class BaseReactiveSet<T> implements ReadonlyReactiveSet<T> {
    filter<R extends T>(predicate: FilterPredicate<T, R>): ReadonlyReactiveSet<R> {
        return new FilteredReactiveSet<T, R>(this, predicate);
    }

    map<R>(converter: ConverterFunction<T, R>): ReadonlyReactiveSet<R> {
        return new MappedReactiveSet<T, R>(this, converter);
    }

    abstract readonly add$: Observable<T>;
    abstract readonly in$: Observable<T>;
    abstract length$: Observable<number>;
    abstract readonly remove$: Observable<T>;

    abstract readonly flat$: Observable<ReadonlySet<T>>;

    abstract has$(entry: T): Observable<boolean>;
}

/**
 * @internal
 */
function toReactivePredicate<T, R extends T>(filterPredicate: FilterPredicate<T, R>): (element: T) => Observable<boolean> {
    return element => {
        const result = filterPredicate(element) as boolean | Observable<boolean>;
        if (result instanceof Observable) {
            return result;
        } else {
            return of(result);
        }
    };
}

/**
 * @internal
 */
class FilteredReactiveSet<T, R extends T> extends BaseReactiveSet<R> {
    private filtered$ = new Observable<ReadonlyReactiveSet<R>>(subscriber => {
        const reactivePredicate = toReactivePredicate(this.predicate);

        const clean$ = new ReplaySubject<void>(1);

        const filtered = new ReactiveSet<R>();
        merge(
            this.source.in$.pipe(map<T, [boolean, R]>(element => [true, element as R])),
            this.source.remove$.pipe(map<T, [boolean, R]>(element => [false, element as R]))
        )
            .pipe(takeUntil(clean$))
            .subscribe(([exists, element]) => {
                if (exists) {
                    reactivePredicate(element).pipe(
                        takeUntil(
                            race(
                                clean$,
                                this.source.remove$.pipe(
                                    filter(removedElement => removedElement === element)
                                )
                            )
                        )
                    ).subscribe(predicatedHas => {
                        if (predicatedHas) {
                            filtered.add(element);
                        } else {
                            filtered.remove(element);
                        }
                    });
                } else {
                    filtered.remove(element);
                }
        });

        subscriber.next(filtered);

        return () => {
            clean$.complete();
        }
    }).pipe(
        share() // this is important. share() make us sure that there is only one filtered-copy of original set at a time
    );

    readonly remove$ = this.filtered$.pipe(switchMap(filtered => filtered.remove$));
    readonly add$ = this.filtered$.pipe(switchMap(filtered => filtered.add$));
    readonly in$ = this.filtered$.pipe(switchMap(filtered => filtered.in$));
    readonly length$ = this.filtered$.pipe(switchMap(filtered => filtered.length$));

    readonly flat$ = flatten(this.in$, this.remove$);

    constructor(
        readonly source: ReadonlyReactiveSet<T>,
        readonly predicate: FilterPredicate<T, R>
    ) {
        super();
    }

    has$(entry: R): Observable<boolean> {
        return this.filtered$.pipe(switchMap(filtered => filtered.has$(entry)));
    }

    filter<R2 extends R>(predicate: FilterPredicate<R, R2>): ReadonlyReactiveSet<R2> {
        return new FilteredReactiveSet<R, R2>(this, predicate);
    }
}

/**
 * @internal
 */
class MappedReactiveSet<T, R> extends BaseReactiveSet<R> {
    private mapped$ = new Observable<ReadonlyReactiveSet<R>>(subscriber => {
        const clean$ = new ReplaySubject<void>(1);

        const mapped = new ReactiveSet<R>();
        merge(
            this.source.in$
        )
            .pipe(takeUntil(clean$))
            .subscribe(sourceElement => {
                let hasLast = false;
                let last: R;

                concat(
                    this.converter(sourceElement).pipe(
                        takeUntil(
                            race(
                                clean$,
                                this.source.remove$.pipe(
                                    filter(removedElement => removedElement === sourceElement)
                                )
                            ).pipe(ignoreElements())
                        ),
                        map(conversion => [true, conversion] as const)
                    ),
                    of([false] as const)
                ).subscribe(([exists, conversion]) => {
                    if(hasLast) {
                        mapped.remove(last);
                        hasLast = false;
                    }
                    if (exists) {
                        mapped.add(conversion as R);
                        last = conversion as R;
                        hasLast = true;
                    }
                });
            });

        subscriber.next(mapped);

        return () => {
            clean$.complete();
        }
    }).pipe(
        share() // this is important. share() make us sure that there is only one mapped-copy of original set at a time
    );

    readonly remove$ = this.mapped$.pipe(switchMap(mapped => mapped.remove$));
    readonly add$ = this.mapped$.pipe(switchMap(mapped => mapped.add$));
    readonly in$ = this.mapped$.pipe(switchMap(mapped => mapped.in$));
    readonly length$ = this.mapped$.pipe(switchMap(mapped => mapped.length$));

    readonly flat$ = flatten(this.in$, this.remove$);

    constructor(
        readonly source: ReadonlyReactiveSet<T>,
        readonly converter: ConverterFunction<T, R>
    ) {
        super();
    }

    has$(entry: R): Observable<boolean> {
        return this.mapped$.pipe(switchMap(mapped => mapped.has$(entry)));
    }
}

/**
 *  Defines more methods to let the reactive-set be able to be mutated.
 *  And implements a basic writable-reactive-set
 *
 * @typeParam T - Type of the elements in reactive-set
 */
export class ReactiveSet<T> extends BaseReactiveSet<T> {

    private addSubject = new Subject<T>();
    private removeSubject = new Subject<T>();
    private lengthSubject = new BehaviorSubject<number>(0);

    /**
     * @inheritDoc
     */
    readonly add$: Observable<T> = this.addSubject.asObservable();

    /**
     * @inheritDoc
     */
    readonly remove$: Observable<T> = this.removeSubject.asObservable();

    /**
     * @inheritDoc
     */
    readonly length$: Observable<number> = this.lengthSubject.asObservable();

    /**
     * @inheritDoc
     */
    readonly flat$ = flatten(this.in$, this.remove$);

    private readonly entries: T[] = [];

    /**
     * @inheritDoc
     */
    readonly in$: Observable<T> =
        concat(
            fromArray(this.entries),
            this.add$
        );

    constructor() {
        super();
    }

    private has(entry: T): boolean {
        return this.entries.includes(entry);
    }

    /**
     * @inheritDoc
     */
    has$(entry: T): Observable<boolean> {
        return concat(
            of(this.has(entry)),
            this.add$.pipe(
                filter(add => add === entry),
                mapTo(true)
            ),
            this.remove$.pipe(
                filter(remove => remove === entry),
                mapTo(true)
            )
        );
    }

    /**
     *  Adds the entry to the reactive-set if it doesn't exists in. And, emits
     *  events into reactive streams about the mutation if any happens.
     *
     * @event this.$add - Emits entry to the add-stream
     *
     * @param entry - Entry to add the into this reactive-set
     */
    add(entry: T): void {
        if (!this.has(entry)) {
            this.entries.push(entry);
            this.lengthSubject.next(this.entries.length);
            this.addSubject.next(entry);
        }
    }

    /**
     *  Removes the entry from the reactive-set if it exists in. And, emits
     *  events into reactive streams about the mutation if any happens.
     *
     * @event this.$remove - Emits entry to the remove-stream
     *
     * @param entry - Entry to remove from this reactive-set
     */
    remove(entry: T): void {
        const index = this.entries.indexOf(entry)
        if (index > -1) {
            this.entries.splice(index, 1);
            this.lengthSubject.next(this.entries.length);
            this.removeSubject.next(entry);
        }
    }

}
