# Aseprite Test Fixtures

This directory contains sample `.ase` and `.aseprite` files from the [Aseprite test suite](https://github.com/aseprite/aseprite/tree/main/tests/sprites).

These files are used to test Baipix's Aseprite import functionality, including color modes, layers, groups, frames, cels, linked cels, tags, palettes, slices, and tilemaps.

| File                        | Description                                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `abcd.aseprite`             | Indexed color mode, 32×32 pixels, four layers (`a`, `b`, `c`, `d`).                                                                                                                 |
| `groups2.aseprite`          | Indexed color mode, 8×8 pixels, two groups (`items`, `player`), with two layers in each group. The `items/gun` layer is hidden.                                                     |
| `tags3.aseprite`            | Three tags (`forward`, `reverse`, `pingpong`), three layers (`a`, `b`, `c`), 4×4 pixels, linked cels, and empty cels in layer `c`.                                                  |
| `2f-index-3x3.aseprite`     | Indexed color mode, two frames, one layer, with the mask color set to palette index 21.                                                                                             |
| `file-tests-props.aseprite` | Indexed color mode, 64×64 pixels, six frames, four layers (including a tilemap), 13 cels, one tag, and user data properties of different types assigned to several sprite elements. |

## License

The original test files are from the [Aseprite repository](https://github.com/aseprite/aseprite/tree/main/tests/sprites).

Copyright (c) 2018-2023 Igara Studio S.A.  
Copyright (c) 2018 David Capello

These materials are distributed under the MIT License. The original copyright notice and permission notice must be retained in copies or substantial portions of the Software.

See [LICENSE.txt](./LICENSE.txt) for the full license text.

The fixtures are used in Baipix solely for testing and verifying Aseprite file import compatibility.
