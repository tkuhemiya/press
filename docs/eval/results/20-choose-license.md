# Choosing an open-source license for a library

For a library, the license question mostly comes down to one thing: **what do you want to
require of the people who build on your code?** Nothing beyond keeping your copyright
notice? Sharing their changes to *your* files? Releasing their entire program under the same
terms? Each answer maps to a family of licenses, and within each family there is a common,
well-understood default. Pick the default unless you have a specific reason not to; unusual
licenses make lawyers at adopting companies nervous, and that costs you users.

(This is general guidance, not legal advice. If your employer, a funder or existing code
you've copied has a say, check with them first.)

## The three families

- **Permissive** (MIT, BSD, Apache-2.0): anyone may use, modify and ship your code, including
  in closed-source products, as long as they keep the copyright and license notice.
- **Weak copyleft** (MPL-2.0, LGPL): if someone modifies *your* files and distributes them,
  they must share those changes under the same license. Their own code that merely uses your
  library can stay under any license.
- **Strong copyleft** (GPL-3.0, AGPL-3.0): anyone who distributes a program that includes
  your library must release the *whole* program under the GPL. AGPL extends this to software
  offered over a network.

## A quick way to decide

```decision-tree id=pick title="Which license?"
spread: "Is wide adoption, including in commercial products, the main goal?"
patents: "Do you want an explicit patent grant?"
changes: "Should changes to your files come back to the project?"
whole: "Should whole programs that use it stay open source?"
network: "Will it mostly run on servers others access?"
mit: "MIT"
apache: "Apache-2.0" {role=focus}
mpl: "MPL-2.0"
gpl: "GPL-3.0"
agpl: "AGPL-3.0"
spread -> patents : yes
spread -> changes : no
patents -> apache : yes
patents -> mit : "no, keep it short"
changes -> whole : yes
changes -> patents : no
whole -> mpl : "no, just my files"
whole -> network : yes
network -> agpl : yes
network -> gpl : no
steps:
  spread -> patents "Most library authors want their code used as widely as possible. That points to a permissive license."
  patents -> apache "Apache-2.0 adds an express patent license and a patent-retaliation clause, which corporate users like."
  changes -> whole "If you do want something back, decide how far the obligation should reach."
  whole -> mpl "MPL-2.0 is file-level copyleft: fixes to your code come back, but it can still be used in proprietary software."
```

For most libraries the answer lands at the top of the tree. If you want your library to be
the one people reach for, a [permissive license](#pick.spread) removes every reason for a
company's legal review to say no. Between the two common choices,
[Apache-2.0](#pick.apache) is longer but includes an explicit patent grant;
[MIT](#pick.mit) is a few short paragraphs everyone has already read.

Strong copyleft on a *library* is a deliberate choice with a real cost. A GPL library can
only be used by GPL-compatible programs, which rules out most commercial users and some open
source projects too. That is the point if you want to keep derivatives free, but it is not
a neutral default. If you want reciprocity without that reach, [MPL-2.0](#pick.mpl) is the
middle path: changes to your files must be shared, and nothing else is affected.

## Side by side

```tradeoffs id=compare title="Common library licenses"
mit: "MIT"
apache: "Apache-2.0" {role=focus}
mpl: "MPL-2.0"
lgpl: "LGPL-3.0"
gpl: "GPL-3.0"
group "Adoption" {
  mit.closed : "allowed" {role=happy}
  apache.closed : "allowed" {role=happy}
  mpl.closed : "allowed" {role=happy}
  lgpl.closed : "allowed, if relinkable"
  gpl.closed : "not allowed" {role=error}
  mit.familiar : "everyone knows it" {role=happy}
  apache.familiar : "widely approved" {role=happy}
  mpl.familiar : "less common"
  lgpl.familiar : "often avoided" {role=error}
  gpl.familiar : "often banned in companies" {role=error}
}
group "Obligations" {
  mit.share : "none"
  apache.share : "none, note changes"
  mpl.share : "changed files"
  lgpl.share : "the library"
  gpl.share : "whole program" {role=error}
}
group "Protection" {
  mit.patent : "implicit at best" {role=error}
  apache.patent : "explicit grant" {role=happy}
  mpl.patent : "explicit grant" {role=happy}
  lgpl.patent : "explicit grant" {role=happy}
  gpl.patent : "explicit grant" {role=happy}
  mit.length : "short" {role=happy}
  apache.length : "long"
  mpl.length : "medium"
  lgpl.length : "long, on top of GPL"
  gpl.length : "long"
}
```

## Practical notes

- **Compatibility.** Apache-2.0 code can go into GPL-3.0 projects but not GPL-2.0-only ones.
  MIT goes almost anywhere. If you expect your library to be vendored into GPL-2.0 projects
  such as the Linux kernel, MIT or a dual license (`MIT OR Apache-2.0`, the Rust ecosystem's
  default) avoids the problem.
- **Ecosystem norms count.** npm leans MIT, Rust uses `MIT OR Apache-2.0`, much of the Java
  and cloud world uses Apache-2.0. Matching your ecosystem means fewer questions.
- **Applying it.** Put the full text in a `LICENSE` file at the root, set the license field
  in your package manifest with an SPDX identifier, and, for Apache-2.0, consider a `NOTICE`
  file. Add an SPDX header (`SPDX-License-Identifier: MIT`) to each source file if you like.
- **You can relicense later, but only easily in one direction.** Moving from permissive to
  copyleft is easy for future versions; going the other way requires agreement from every
  contributor unless you collected a contributor license agreement.

If you just want an answer: **Apache-2.0** for a library you hope companies will adopt, **MIT**
if you prefer something shorter and do not care about patents, **MPL-2.0** if you want fixes
to come back to you.
