define(function() {

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
        MELODY: 2,
        APT: 3,
        names: ['FLOW', 'STAMINA', 'MELODY', 'APT']
    };

    return {
        gameTypes: gameTypes,
        gameStates: gameStates
    }
});
