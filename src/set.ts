import {BehaviorSubject, concat, Observable, of, Subject, throwError} from 'rxjs';
import {filter, mapTo} from 'rxjs/operators';
import {fromArray} from 'rxjs/internal/observable/fromArray';

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
    filter<R extends T>(predicate: (entry: T) => entry is R): ReadonlyReactiveSet<R>;
}

/**
 * @internal
 */
abstract class BaseReactiveSet<T> implements ReadonlyReactiveSet<T> {
    filter<R extends T>(predicate: (entry: T) => entry is R): ReadonlyReactiveSet<R> {
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
class FilteredReactiveSet<T, R extends T> extends BaseReactiveSet<T> {
    constructor(
        readonly source: ReadonlyReactiveSet<T>,
        readonly predicate: (entry: T) => entry is R
    ) {
        super();
    }

    readonly remove$ = this.source.remove$.pipe(filter(this.predicate));
    readonly add$ = this.source.add$.pipe(filter(this.predicate));
    readonly in$ = this.source.remove$.pipe(filter(this.predicate));
    readonly length$ = throwError(new Error('not implemented yet'));
    has$(entry: T): Observable<boolean> {
        return this.predicate(entry) ? this.source.has$(entry) : of(false);
    }

    filter<R extends T>(predicate: (entry: T) => entry is R): ReadonlyReactiveSet<R> {
        return new FilteredReactiveSet<T, R>(this, predicate);
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
