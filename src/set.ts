import {BehaviorSubject, concat, Observable, of, Subject, throwError} from 'rxjs';
import {filter, mapTo} from 'rxjs/operators';
import {fromArray} from 'rxjs/internal/observable/fromArray';

export interface ReadonlyReactiveSet<T> {
    readonly add$: Observable<T>;
    readonly remove$: Observable<T>;
    readonly in$: Observable<T>;
    has$(entry: T): Observable<boolean>;
    length$: Observable<number>;

    filter<R extends T>(predicate: (entry: T) => entry is R): ReadonlyReactiveSet<R>;
}

export interface ReactiveSet<T> extends ReadonlyReactiveSet<T>{
    add(entry: T): void;
    remove(entry: T): void;
}

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

export class FilteredReactiveSet<T, R extends T> extends BaseReactiveSet<T> {
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

export class ReactiveSet<T> extends BaseReactiveSet<T> implements ReactiveSet<T> {

    private addSubject = new Subject<T>();
    private removeSubject = new Subject<T>();
    private lengthSubject = new BehaviorSubject<number>(0);

    readonly add$: Observable<T> = this.addSubject.asObservable();
    readonly remove$: Observable<T> = this.removeSubject.asObservable();
    readonly length$: Observable<number> = this.lengthSubject.asObservable();

    private readonly entries: T[] = [];

    readonly in$: Observable<T> =
        concat(
            fromArray(this.entries),
            this.add$
        );

    has(entry: T): boolean {
        return this.entries.includes(entry);
    }
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

    add(entry: T): void {
        if (!this.has(entry)) {
            this.entries.push(entry);
            this.lengthSubject.next(this.entries.length);
            this.addSubject.next(entry);
        }
    }
    remove(entry: T): void {
        const index = this.entries.indexOf(entry)
        if (index > -1) {
            this.entries.splice(index, 1);
            this.lengthSubject.next(this.entries.length);
            this.removeSubject.next(entry);
        }
    }

}
