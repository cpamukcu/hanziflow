# HanziFlow redesign — progress

Steps 0-8 of the guide are implemented on branch `redesign`. See README.md for how to run, test and rebuild.

Beyond the guide: the dictionary now holds all of CC-CEDICT (~119k words, lazy-loaded), examples must sit on word
boundaries, modern words have hand-written examples (`tools/modern_examples.json`), and rare words get a labelled
generic example.

Remaining: merge to `main` to deploy, then check the live site and re-import a real backup.
