import {defer, MonoTypeOperatorFunction} from 'rxjs';
import {filter, flatMap, mapTo} from 'rxjs/operators';

/**
 * This operator acts as almost as regular filter operator but there is a different point.
 * It accepts an async function to be predicate logic which determines that the emitted value passes or else.
 * @param asyncPredicate An async function to predicate that the emitted value passes or else.
 * @param thisArg An optional argument to determine the value of `this` in the `predicate` function.
 */
export function flatFilter<T>(asyncPredicate: (value: T, index: number) => Promise<boolean>,
                         thisArg?: any): MonoTypeOperatorFunction<T> {
    return source => source.pipe(
        flatMap(
            (value, index) =>
                defer(() => asyncPredicate(value, index)).pipe(
                    filter(predicateResult => predicateResult),
                    mapTo(value)
                )
        )
    );
}
