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
    distinctUntilChanged,
    filter,
    flatMap,
    map,
    mapTo,
    mergeAll,
    mergeMap,
    scan,
    share,
    switchMap, takeUntil
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
     * @returns Returns a boolean which filters element in or out.
     */
    (entry: T): entry is R;
    /**
     * @param entry - Takes element from base reactive-set to check if that if it is filtered or not.
     * @returns Returns an reactive boolean result which decides element's existence in sub-set, and it can be actively changed in time
     */
    (entry: T): Observable<boolean>;
}

/**
 *  Defines fields and methods which required to implement an essential readonly-reactive-set
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
     *  Returns a reactive-stream which emits entry's current and future statuses
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
     *  Returns a READONLY reactive-subset which is filtered by the predicate function
     *
     * @typeParam R - Desired element type (which extends element type T of main set) of filtered subset
     *
     * @param predicate - Predicate function to filter source reactive-set
     * @returns Filtered reactive-subset of this reactive-set
     *
     * @beta
     */
    filter<R extends T>(predicate: FilterPredicate<T, R>): ReadonlyReactiveSet<R>;
}

/**
 * @internal
 */
abstract class BaseReactiveSet<T> implements ReadonlyReactiveSet<T> {
    filter<R extends T>(predicate: FilterPredicate<T, R>): ReadonlyReactiveSet<R> {
        return new FilteredReactiveSet<T, R>(this, predicate);
    }

    abstract readonly add$: Observable<T>;
    abstract readonly in$: Observable<T>;
    abstract length$: Observable<number>;
    abstract readonly remove$: Observable<T>;

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
            this.source.add$.pipe(map<T, [boolean, R]>(element => [true, element as R])),
            this.source.remove$.pipe(map<T, [boolean, R]>(element => [false, element as R]))
        )
            .pipe(takeUntil(clean$))
            .subscribe(([has, element]) => {
                if (has) {
                    reactivePredicate(element).pipe(
                        takeUntil(
                            race(
                                clean$,
                                this.source.remove$.pipe(filter(removedElement => removedElement === element)))
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

        return () => {
            clean$.complete();
        }
    }).pipe(
        share() // this is important. share() make us sure that there is only one filtered-copy of original set at a time
    );

    constructor(
        readonly source: ReadonlyReactiveSet<T>,
        readonly predicate: FilterPredicate<T, R>
    ) {
        super();
    }

    readonly remove$ = this.filtered$.pipe(switchMap(filtered => filtered.remove$));
    readonly add$ = this.filtered$.pipe(switchMap(filtered => filtered.add$));
    readonly in$ = this.filtered$.pipe(switchMap(filtered => filtered.in$));
    readonly length$ = this.filtered$.pipe(switchMap(filtered => filtered.length$));
    has$(entry: R): Observable<boolean> {
        return this.filtered$.pipe(switchMap(filtered => filtered.has$(entry)));
    }

    filter<R2 extends R>(predicate: FilterPredicate<R, R2>): ReadonlyReactiveSet<R2> {
        return new FilteredReactiveSet<R, R2>(this, predicate);
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

    private readonly entries: T[] = [];

    /**
     * @inheritDoc
     */
    readonly in$: Observable<T> =
        concat(
            fromArray(this.entries),
            this.add$
        );

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
