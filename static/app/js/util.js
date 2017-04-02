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
        SANDBOX: 1, // free training
        STAMINA: 2, // independent timing
        SCALES: 3, // learn key signatures no movement
        MELODY: 4,
        APT: 5,
        names: ['FLOW', 'SANDBOX', 'STAMINA', 'SCALES', 'MELODY', 'APT']
    };


    var notesInOrder = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

    let notesForScale = new Array(
            ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'A'],
            ['B', 'C', 'D', 'E', 'F', 'G', 'A', 'B'],
            ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'],
            ['D', 'E', 'F', 'G', 'A', 'B', 'C', 'D'],
            ['E', 'F', 'G', 'A', 'B', 'C', 'D', 'E'],
            ['F', 'G', 'A', 'B', 'C', 'D', 'E', 'F'],
            ['G', 'A', 'B', 'C', 'D', 'E', 'F', 'G']);

    let octavesForScale = new Array(
            [ 2,   2,   3,   3,   3,   3,   3,   3 ],
            [ 2,   3,   3,   3,   3,   3,   3,   3 ],
            [ 3,   3,   3,   3,   3,   3,   3,   4 ],
            [ 3,   3,   3,   3,   3,   3,   4,   4 ],
            [ 3,   3,   3,   3,   3,   4,   4,   4 ],
            [ 3,   3,   3,   3,   4,   4,   4,   4 ],
            [ 3,   3,   3,   4,   4,   4,   4,   4 ]);

    // return ascending + descending scale, 
    // with tonic of higher order used only once // FIXME this is temporarily FALSE
    function mirrorScale(scale) {
        let capNote = [scale[0][0], (scale[0][1]+1)];
        let Selacs = [ capNote, capNote ].concat(scale.slice().reverse());
        return scale.slice().concat(Selacs);
    }


    // no stupid logic, relatively straightforward
    function getScaleForKey(keysig) {
        if(!keysig) throw "NOT IMPLEMENTED";
        let tonic = keysig[0], // letter from string (tonic)
            tonicIdx = notesInOrder.indexOf(tonic),
            notes = notesForScale[tonicIdx],
            octaves = octavesForScale[tonicIdx];
        return notes.map( (note, idx) => [ note, octaves[idx] ] );
    }

    // TODO move this cruft into keyboard, add octave
    // FIXME this only allows treble cleff
    // TODO will this ever work with duration? likely not...
    function getVexNoteForPianoKey(pKey) {
        let octave = pKey.id.replace(pKey.note, '');
        let vexNoteName = pKey.note.replace('s', '#');
        return new Vex.Flow.StaveNote({clef: "treble", keys: [''+vexNoteName+'/'+(parseInt(octave))], duration: "q", auto_stem: true });
    }
    function getGhostNoteForPianoKey(pKey) {
        let octave = pKey.id.replace(pKey.note, '');
        let vexNoteName = pKey.note.replace('s', '#');
        return new Vex.Flow.GhostNote({clef: "treble", keys: [''+vexNoteName+'/'+(parseInt(octave))], duration: "q", auto_stem: true });
    }

    return {
        gameTypes: gameTypes,
        gameStates: gameStates,
        mirrorScale: mirrorScale,
        getScaleForKey: getScaleForKey,
        getVexNoteForPianoKey: getVexNoteForPianoKey,
        getGhostNoteForPianoKey: getGhostNoteForPianoKey
    }
});
