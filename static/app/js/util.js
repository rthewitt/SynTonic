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

    function getScaleForKey(keysig) {
        // TODO only works for C Major
        return [['C',3],['D',3],['E',3],['F',3],['G',3],['A',3],['B',3], ['C',4]];
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
        getScaleForKey: getScaleForKey,
        getVexNoteForPianoKey: getVexNoteForPianoKey
    }
});
