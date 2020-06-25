# Reactive-Library
[![Build Status](https://travis-ci.org/muhammetaliakbay/reactive-library.svg?branch=master)](https://travis-ci.org/muhammetaliakbay/reactive-library)[![GitHub](https://img.shields.io/github/license/muhammetaliakbay/reactive-library)](https://opensource.org/licenses/GPL-3.0)[![npm (scoped)](https://img.shields.io/npm/v/@muhammetaliakbay/reactive-library)](https://www.npmjs.com/package/@muhammetaliakbay/reactive-library)

Reactive-Library is a TypeScript library for dealing with reactive implementations of essential data structures.

## Installation

Use your favorite package manager to add **@muhammetaliakbay/reactive-library** as your dependency.

```bash
yarn add @muhammetaliakbay/reactive-library
```

## API Documents (TypeDoc)

Find detailed api documentations here <https://reactive-library.muhammetaliakbay.com/>.

## ReactiveSet

### Example

```typescript
import {ReactiveSet} from '@muhammetaliakbay/reactive-library';

const set = new ReactiveSet<string>()

set.add$.subscribe(
    element => console.log(`${element} added to the set`)
);
set.remove$.subscribe(
    element => console.log(`${element} removed from set`)
);

set.add('My'); // adds 'My'
set.add('Home'); // and 'Home'
set.add('Sweet'); // and 'Sweet' for only one time
set.add('Home'); // do NOT adds 'Home' twice while it has 'Home' already (as a ideal set)

set.remove('My'); // simply removes 'My' from set (if it in the set)

// Console Outputs:
//   My added to the set
//   Home added to the set
//   Sweet added to the set
//   My removed from set
```

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License
[GNU GPLv3](https://choosealicense.com/licenses/gpl-3.0/)
