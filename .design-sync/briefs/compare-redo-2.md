# Rebuffer: Compare (redesign), what still needs a look

The owner likes the redesign in `templates/compare-2/` and wants to keep it. Before it's built, I checked every state
against the brief and against how the app's data actually works. These came up. They're problems and facts, not
requests for a particular fix: how to solve them is yours.

## Points that don't add up

Scores are held between 0 and 100, but the formula behind them isn't: its parts can add up to less than 0 (and, in
principle, to more than 100, when a player shows better than the quality its run is measured against). "Where the
points went" walks from A's score to B's by adding the parts, so when a score is held at 0 or 100 the walk doesn't end
on the score shown. A real case: Rural 3G with the Defaults player. Its picture earns 68 points, the 11.7 s wait for
the first frame costs 60 and its quality switches cost 14, so the parts come to about −6 while the score shows 0. A
score that doesn't match its own breakdown is the kind of thing the owner called misleading on the old page.

## Colours that read the wrong way

The bars in "Where the points went" take the colour of their part: quality green, stalls red, the rest grey. So a
loss of quality is drawn green, close to the green that means "better" in the verdict and in B's score bar. In "Two
things changed", the biggest loss on the page (−34) is the biggest green bar. And a gain and a loss look the same
apart from the sign: in "Mixed", the first frame's +3 and the switches' −2 are both grey.

## A phone screen that scrolls sideways

"Stopped partway" at 360 px: the page scrolls sideways by 111 px. The three buttons at the top (Run B again, Choose
other runs, Swap A and B) stay on one line. The other states fit.

## Situations not drawn yet

- **A run whose simulation check failed.** When the visitor's real network was slower than the simulated one, part
  of that run's result comes from their own network, not from the network they picked. The app's rule is never to
  present that as the simulated network's result; the Report shows it as a banner. In Compare it could be A, B or
  both.
- **A stopped early, or both.** The screens stop only B. Both could be stopped at different points (say A at 0:41 and
  B at 1:05), or both under the minimum.
- **Choosing A.** The "Choose two runs" screen starts with A already set (as it is when coming from a Report). From
  the Runs page nothing is chosen yet, and "Change A" leads somewhere not drawn.

## What the sentences can say

The verdict's sentence and "Where they differ" are written by the app from the numbers, by rules. It knows what
happened and when: each run's quality, buffer, stalls, first frame, downloads, the network's curve and the player's
settings. It can't know why. A sentence like "B's buffer stops at 10 s, so it ran dry" or "B's 10 s segments made it
start later" is a guess about the cause, and on this page a guess would read as a finding. The design's sentences
should be the kind the numbers can back.

## Small facts

- The 30 s minimum for comparing scores is 30 s, or half the network's length when the network is shorter than a
  minute (people can draw short networks). "Needs 30 s to score" wouldn't always be true.
- The 2-point spread of repeat runs was measured on whole runs. Nobody has measured it for a score over part of a run
  (the first 0:41).

## What to send back

The updated screens, with a note wherever you chose something.
