This is a new daily word game called metratrope.

The idea of the game is to take an english compound word with two non-germanic
roots and translate those two roots into a new language. Then the goal of the
game is to figure out the original word. 

For example if the clue was plicocharta the answer would be origami.

There are also a few levels of hints. You can get the source and destination 
language (e.g. Latin -> Japanese). You can get the split (plico + charta). You
can get other english words that use the same roots (duplicate or charography).
This is a seperate hint for each one. And finally you can get the definitions of
the roots (fold or paper). Again a seperate hint per root.

Build this game. You should make
- A frontend that can be deployed to github pages
    - Use a clean minimilist style in the tradition of these games
    - It should have the traditional features:
        - A tutorial (use the name of the game, metatrope -> transliterate)
        - The hint system
        - A share button and countdown to the next puzzle when you beat it
- An agent skill to generate the puzzles
    - Generate a few good puzzles yourself for prototyping the UI and then
      discuss with me good puzzle design before writing the skill
- A UI for me to review the generated puzzles and decide which ones to publish.
    - with this and the skill you should set up an easy workflow for me to make
      new puzzles
