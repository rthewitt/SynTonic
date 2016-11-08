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
        FLOW: 0,
        MELODY: 1,
        APT: 2,
        names: ['FLOW', 'MELODY', 'APT']
    };

    return {
        gameTypes: gameTypes,
        gameStates: gameStates
    }
});
