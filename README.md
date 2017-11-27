# SynTonic

This is an HTML5 video game that teaches piano.  It's essentially like a guitar hero for piano, or eMedia Piano Method if you remember that.  The notes fly past and you play the correct key before it's too late.  The motivation is to create a game that adapts to the player and maintains a flow state and challenge level.

There are experiments within experiments on this one.  Each branch is something different.  Old versions of the game were rigid old-style JavaScript, with my own simple placeholder graphics. There are several game modes - most of which are "broken" since I rewrote the game using (mostly) new ES6 features, and in the style of [Functional Reactive Programming](https://en.wikipedia.org/wiki/Functional_reactive_programming).

The game modes were me trying to find out what works best for getting people into the flow state.

My personal MIDI keyboard is hardcoded, but you can technically play with the letter-names of notes with QWERTY.  Shift makes a sharp, ctrl makes a flat. You can play the audio in browser or through the instrument.

**Note**

The game doesn't indicate healthy fingering.  I went down a 6-month rabbit hole of AI research to find out if I can train a neural network to play like a human expert, and generate infinite music.  That's changed to NLP now that I don't have an instrument. Future versions will use a sort of live spectogram instead of discrete music notes.


**UPDATE:** I moved into an RV, sold all of my possessions including my keyboard.  Development paused.

The whistle branch was me realizing I could use pitch detection and whistle instead of playing the piano. I can whistle really well now.  It's part of a larger goal to make a game that teaches people to sing.


