# Licensing

This repo holds code under two licenses. The fork's own work is MIT. Only the original author's
code is under his license, FSL-1.1-MIT, and it turns into MIT on its own in 2028.

This page is a plain summary, not legal advice. The license files are what count.

## Which code is under which license

| Code | License | File |
| --- | --- | --- |
| The original app by Josh Moyers: everything in the original repo's history up to its `main` at commit `af7a938a0` (2026-09-03). This repo keeps that history frozen as the branch `main`. | FSL-1.1-MIT, Copyright 2026 Josh Moyers | [LICENSE](LICENSE) |
| The fork's own work: every change this fork made after that point (commits not reachable from `main`). | MIT | [LICENSE-MIT](LICENSE-MIT) |
| Code adopted from outside contributors' pull requests (listed in [docs/community/ADOPTIONS.md](docs/community/ADOPTIONS.md)). | The license it was contributed under (FSL-1.1-MIT, the repo's license at the time), unless its author agrees to MIT | [LICENSE](LICENSE) |

Why the split: only a copyright holder can change the license of his own code. The original
code is Josh Moyers' and keeps his license. The fork's new work is the fork's, so it is MIT.

A file the fork changed can hold both. The fork's changes are MIT, but the file as a whole is
still a modified copy of the original, so FSL-1.1-MIT applies to it until the original converts.

A shipped build contains both kinds of code: its original parts are FSL-1.1-MIT and the rest is
MIT. [LICENSE](LICENSE) must travel with every copy of the code or a build; FSL requires it.

## The 2028 conversion

FSL-1.1-MIT grants MIT for each version two years after that version was made available. The
original code was published between 2026-08-04 and 2026-09-03, so it becomes MIT between
about 2028-08-04 and 2028-09-03. Adopted contributions under FSL-1.1-MIT convert the same way,
two years after each was made available.

## What FSL-1.1-MIT allows today

Any use except a competing commercial one: you may use, copy, change and share the code, as long
as you are not offering it, or something that substitutes for it, as a commercial product or
service. A free community build, like this one, is a permitted use. See [LICENSE](LICENSE) for
the exact terms.

## How to tell which license a line is under

Run `git blame` on the file (`git blame -C -C` also follows code that was moved or copied). If
the commit a line comes from is reachable from `main` (`git merge-base --is-ancestor <commit>
main` exits 0), the line is original code under FSL-1.1-MIT. If not, it is the fork's work under
MIT, unless the commit is from an adopted pull request in
[docs/community/ADOPTIONS.md](docs/community/ADOPTIONS.md).

## Contributing

New contributions to this repo are accepted under the MIT license. By opening a pull request
here you agree that your change is licensed under [LICENSE-MIT](LICENSE-MIT).
