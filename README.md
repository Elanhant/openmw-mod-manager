# OpenMW Mod Manager

> IMPORTANT! This is a personal WIP project and should not be considered final or stable at this moment. It has been working quite well for me, and I will appreciate any feedback or bug reports, but do not expect this to be a Mod Organizer killer. Use it at your own risk!

A very basic mod manager for [OpenMW](https://openmw.org/en/).

Its goal is to provide a more convenient way to install, enable or sort mods (it also can run [mlox](https://github.com/mlox/mlox) if you have it installed).

## Usage

TODO

## Caveats

- `.omwaddon` files are not currently supported by mlox, so you will need to sort them manually _after_ sorting with mlox.
- This mod manager currently overwrites your `openmw.cfg` file, so make sure to create a backup before trying (check [this wiki](https://openmw.readthedocs.io/en/latest/reference/modding/paths.html#configuration-files-and-log-files) to find where this file is located).

## Notes

Built using [Electron Forge + Svelte Starter
](https://github.com/codediodeio/electron-forge-svelte).
