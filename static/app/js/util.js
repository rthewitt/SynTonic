define(['vexflow'], function(Vex) {

    var gameStates = {
        NOT_STARTED: 0,
        INPUT_CONTROL: 1,
        STARTED: 2,
        ANIMATING: 3,
        WON: 4,
        LOST: 5,
        names: ['NOT_STARTED', 'INPUT_CONTROL', 'STARTED', 'ANIMATING', 'WON', 'LOST']
    }; 

    var gameTypes = {
        FLOW: 0, // accuracy, perhaps relay
        STAMINA: 1, // independent timing
        SCALES: 2, // learn key signatures no movement
        MELODY: 3,
        APT: 4,
        names: ['FLOW', 'STAMINA', 'SCALES', 'MELODY', 'APT']
    };


    var notesInOrder = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

    let notesForScale = new Array(
            ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
            ['B', 'C', 'D', 'E', 'F', 'G', 'A'],
            ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
            ['D', 'E', 'F', 'G', 'A', 'B', 'C'],
            ['E', 'F', 'G', 'A', 'B', 'C', 'D'],
            ['F', 'G', 'A', 'B', 'C', 'D', 'E'],
            ['G', 'A', 'B', 'C', 'D', 'E', 'F']);

    let octavesForScale = new Array(
            [ 2,   2,   3,   3,   3,   3,   3 ],
            [ 2,   3,   3,   3,   3,   3,   3 ],
            [ 3,   3,   3,   3,   3,   3,   3 ],
            [ 3,   3,   3,   3,   3,   3,   4 ],
            [ 3,   3,   3,   3,   3,   4,   4 ],
            [ 3,   3,   3,   3,   4,   4,   4 ],
            [ 3,   3,   3,   4,   4,   4,   4 ]);

    // return ascending + descending scale, 
    // with tonic of higher order used only once // FIXME this is temporarily FALSE
    function mirrorScale(scale) {
        let capNote = [scale[0][0], (scale[0][1]+1)];
        let Selacs = [ capNote, capNote ].concat(scale.slice().reverse());
        return scale.slice().concat(Selacs);
    }


    // no stupid logic, relatively straightforward
    function getScaleForKey(keysig) {
        let tonic = keysig[0], // letter from string (tonic)
            tonicIdx = notesInOrder.indexOf(tonic),
            notes = notesForScale[tonicIdx],
            octaves = octavesForScale[tonicIdx];
        return notes.map( (note, idx) => [ note, octaves[idx] ] );
    }

    // TODO move this cruft into keyboard, add octave, get rid of octave # mismatch between HTML and vex
    // FIXME this only allows treble cleff
    // TODO will this ever work with duration? likely not...
    function getVexNoteForPianoKey(pKey) {
        let octave = pKey.id.replace(pKey.note, '');
        let vexNoteName = pKey.note.replace('s', '#');
        return new Vex.Flow.StaveNote({clef: "treble", keys: [''+vexNoteName+'/'+(parseInt(octave)+1)], duration: "q" });
    }

    return {
        gameTypes: gameTypes,
        gameStates: gameStates,
        mirrorScale: mirrorScale,
        getScaleForKey: getScaleForKey,
        getVexNoteForPianoKey: getVexNoteForPianoKey
    }
});
