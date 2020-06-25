import {ReactiveSet} from './set';
import {expectObservable} from './chai';

describe('ReactiveSet', () => {
    describe('Add elements', () => {
        it('When distinct elements added, then length is equal to add operations count', async () => {
            // Arrange
            const addCount = 100;
            const set = new ReactiveSet<number>();

            // Act
            for (let i = 0; i < addCount; i ++) {
                set.add(i);
            }

            // Assert
            await expectObservable(set.length$).asPromise().equals(addCount);
        });

        it('When same elements added, then length is equal to 1', async () => {
            // Arrange
            const addCount = 100;
            const set = new ReactiveSet<number>();

            // Act
            for (let i = 0; i < addCount; i ++) {
                set.add(17);
            }

            // Assert
            await expectObservable(set.length$).asPromise().equals(1);
        });
    });
});
