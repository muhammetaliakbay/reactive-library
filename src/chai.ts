import {Observable} from 'rxjs';
import {take} from 'rxjs/operators';
import { expect } from 'chai';

export class PromiseSubject<T> {
    constructor(readonly subject: Promise<T>) {
    }

    async assertion(): Promise<Chai.Assertion> {
        return expect(await this.subject);
    }

    async equals(value: T): Promise<Chai.Assertion> {
        return (await this.assertion()).equals(value);
    }
}

export function expectPromise<T>(subject: Promise<T>): PromiseSubject<T> {
    return new PromiseSubject<T>(subject);
}

export class ObservableSubject<T> {
    constructor(
        readonly subject: Observable<T>
    ) {
    }

    asPromise(): PromiseSubject<T> {
        return expectPromise(this.subject.pipe(take(1)).toPromise());
    }
}

export function expectObservable<T>(subject: Observable<T>): ObservableSubject<T> {
    return new ObservableSubject<T>(subject);
}
