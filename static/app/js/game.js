/*
 * Game
 *  - start
 *  - update
 *  - schedule
 *  - generate
 *  - clear
 */
define(['underscore', './dispatcher', './util'], function(_, dispatcher, util) {

    var types = util.gameTypes,
        state = util.gameStates;

    // TODO move to prototype only
    // ensure that game flow is dictated outside of functions
    // so that generate, schedule, etc have return values
    // This will also move blacklist testing out of functions

    // Defaults for Flow, Melody style gameplay
    function Game(opts) {
        if(typeof opts.keyboard === 'undefined')
            throw new Exception("No instrument provided - did you mean virtual?");

        this.type = undefined;
        this.round = undefined;

        // will experiment with moving target scores
        // trying static 20 goal for now
        this.baseScore = 9;
        this.reward = opts.reward || 1;
        this.penalty = opts.penalty || 6;
        this.threshold = opts.threshold || 30;

        // How long before we present the next challenge?
        // in Aptitude / pitch training noteDelay also determines how long between
        // notes activation and challenge note is sounded
        this.noteDelay = typeof opts.noteDelay !== 'undefined' ? opts.noteDelay : 500;
        this.soundNotes = typeof opts.soundNotes === 'boolean' ? opts.soundNotes : true;

        this.keyboard = opts.keyboard;
        this.timer = null;
        this.toPlay = [];
        this.qMax = opts.numNotes || 3;
        this.timeout = opts.timeout;

        this.reset(); // put into input state

        // I am ignoring input for now, because no game!!
        //dispatcher.on('key::press', this.playerInput, this);
        //dispatcher.on('key::release', function(key) { }, this);
    }


    // avoid memory leaks!
    Game.prototype.cleanup = function() {
        dispatcher.off('key::press', this.playerInput);
        //dispatcher.off('key::release'...)
    }


    Game.prototype.start = function() {
        this.clear();
        dispatcher.trigger('keys::clear'); // only clears keypresses, TODO rename
        this.state = state.STARTED;
        this.keyboard.silent = false;
        this.score = this.baseScore;
        dispatcher.trigger('game::score', { initial: true, current: this.score, max: this.threshold });
        this.next();
    }


    // must be called with context
    function handleTimeout() {
        this.clear();
        this.state = state.ANIMATING;
        this.score -= this.penalty;
        dispatcher.trigger('game::score', { current: this.score, max: this.threshold });

        if(this.score <= 0) {
            this.lose();
            return;
        }

        var self = this;
        dispatcher.trigger('game::timeout', { onReady: function() {
            // We may have reset the game. This is not an optimial solution
            // We want to avoid this state checking.
            if( self.state === state.ANIMATING ) {
                self.state = state.STARTED;
                self.next();
            }
        } });
    }


    Game.prototype.next = function() {
        console.log('game BASIC next function');
        this.generate(this.qMax);
        this.schedule();
        var self = this;
        this.timer = setTimeout(function() { handleTimeout.call(self) }, this.timeout);
    };

   
    Game.prototype.win = function() {
        this.clear();
        this.state = state.ANIMATING;
        var self = this;
        dispatcher.trigger('game::won', { onFinish: function() {
            self.state = state.WON;
        } });
    };


    Game.prototype.lose = function() {
        this.clear();
        this.state = state.ANIMATING;
        var self = this;
        dispatcher.trigger('game::lost');
    };


    Game.prototype.playerInput = function(key) {
        if(this.state === state.INPUT_CONTROL) {
            if(key.id == this.keyboard.MIDDLE_C) {
                var self = this;
                setTimeout(function() {
                    self.start();
                }, 1000);
            }
            return;
        }

        if(this.timer === null) return;
        var correct = this.toPlay.length > 0 && 
            key.id == this.toPlay[0].id ? true : false;
        this.update(correct, key);
    };


    // TODO remove score duplication
    // flow, memory oriented - I may separate implementations from proto
    Game.prototype.update = function(success, justPlayed) {

        this.score = success ? 
            this.score + this.reward : this.score - this.penalty;

        dispatcher.trigger('game::score', { current: this.score, max: this.threshold });

        if(success) {
            var justPlayed = this.toPlay.shift();

            // I think variable was because when a correct note was played (and subsequently turned green)
            // the UI would clear
            var shouldWait = _.some(this.toPlay, function(key) { return key.id === justPlayed.id; });
            if(!shouldWait) {
                dispatcher.trigger('keys::clear', { keys: [ justPlayed ] });
            }

            dispatcher.trigger('key::success', justPlayed);

            if(this.toPlay.length == 0) {
                this.clear();
                if(this.score >= this.threshold) this.win();
                else this.next();
            } 
        } else {
            dispatcher.trigger('key::miss', justPlayed);
            if(this.timer !== null) clearTimeout(this.timer);
            if(this.score <= 0) this.lose();
            else {
                var self = this;
                this.timer = setTimeout(function() { handleTimeout.call(self); }, this.timeout);
            }
        }
    };


    /*
     * Game does not control the instrument
     * or UI directly - so we schedule a request
     */
    Game.prototype.schedule = function() {
        console.log('apt BASIC schedule');
        // IIRC this default method schedules in a "melody-like" fashion, one after another with delay
        for(var i=0; i < this.toPlay.length; i++) { 
            dispatcher.trigger('game::activate', { keys: [ this.toPlay[i] ], when: (i+1) * this.noteDelay, sound: this.soundNotes });
        }
    };


    /* 
     * generate notes to play or show onscreen
     * different game types will generate
     * note(s), patterns, chords, scales, etc
     */
    Game.prototype.generate = function(num) {
        for(var x=0; x<num; x++) {
            n = undefined;
            do {
                n = Math.floor( Math.random() * (this.keyboard.keys.length-1) ); // those parens are necessary!
            } while(this.keyboard.blacklist.indexOf(n + this.keyboard.min) !== -1); // blacklist currently in MIDI
            this.toPlay.push(this.keyboard.keys[n]);
        }
    };


    /*
     * Currently this is used as "clear milestone"
     * as opposed to completely resetting state.
     * Score is not affected and the game continues
     */
    Game.prototype.clear = function() {
        this.toPlay = []; // ensure single reference?
        if(this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        // if I add keys::clear to this, I should remove it from reset, etc
        // will I ever want to clear the milestone / game WITHOUT ui clear?
    };

    
    // FIXME clears existing timer, but not next?
    Game.prototype.reset = function() {
        this.clear(); // does not clear score, is only used to clear game timer
        this.score = 0; // is there a better place for this?
        dispatcher.trigger('game::score', { initial: true, current: this.score, max: this.threshold });
        dispatcher.trigger('keys::clear'); 
        this.state = state.INPUT_CONTROL;
        this.keyboard.silent = true;
    };

    
    /* TODO
     * IMPORTANT:
     * this function is overridden because we want to put the game
     * into an animating state and then start a second period in which
     * the game is actually awaiting user input. We are going to hack
     * that behavior by using a custom next function but this change
     * should be backported, where a normal game neglects to do so.
     */
    function MELODY_next() {
        this.generate(this.qMax);
        this.state = state.ANIMATING;
        this.schedule();
        var ignorePlayerInputTime = this.noteDelay*(this.toPlay.length+1) // after the last note is played
        var self = this;
        setTimeout(function() {
            if(self.state === state.ANIMATING) { // may have been reset
                self.state = state.STARTED; // allow user input again
                self.timer = setTimeout(function() { handleTimeout.call(self) }, self.timeout);
            }
        }, ignorePlayerInputTime);
    };


    /*
     *
     * this will be used for memory game 
     * whole whole half whole whole whole half 
     * maximum for base key: 6Cs
     * 1. select random as base key 
     * 2. obtain keys for scale structure above
     * 3. choose num random from those, play
     *
     */
    function MELODY_generate(num) {
        // we could use last octave, 
        // but why not allow all scales?
        var maxBase = this.keyboard.idxOfId('6Cs');

        //var base = Math.floor( Math.random() * (maxBase+1) );
        
        // TESTING C MAJOR SCALE
        var base = this.keyboard.idxOfId('3C');

        // whole whole half whole whole whole half 
        // steps: [0,2,2,1,2,2,2,1]
        // major scale [0,2,4,5,7,9,11,12]
        scale = _.map([0,2,4,5,7,9,11,12], function(step) {
            return base + step;
        });

        console.log(scale);

        var n, x, key;
        for(x=0; x<num; x++) {
            n = undefined, key = undefined;
            do {
                n = Math.floor( Math.random() * scale.length );
                key = this.keyboard.keys[scale[n]];
            } while(this.toPlay.indexOf(key) !== -1); // no duplicates for now
            this.toPlay.push(key);
        }
    }

    /*
     * Will generate only C notes for round 1
     */
    function APT_generate(num) {
        console.log('apt custom GENERATE');

        var cKeys = this.keyboard.keysByNote['C'],
            max = cKeys.length; // exclusive

        for(var x=0; x<num; x++) {
            n = Math.floor( Math.random() * max );
            this.toPlay.push(cKeys[n]);
        }
    };


    // activate group (octave or keys)
    function APT_schedule() {  
        console.log('apt CUSTOM schedule');
        if(this.toPlay.length !== 1) 
            throw new Exception("Too many notes queued");

        var key = this.toPlay[0];
        var maskedKeys = this.keyboard.keysByNote[ key.note ];

        // must guarantee order
        setTimeout(function() {
            console.log('want to activate '+maskedKeys.length+'  keys');
            dispatcher.trigger('game::activate', { keys: maskedKeys });
            dispatcher.trigger('game::activate', { keys: [ key ], sound: true });
        }, this.noteDelay);
    }


    function APT_update(success, justPlayed) {

        this.score = success ? 
            this.score + this.reward : this.score - this.penalty;

        dispatcher.trigger('game::score', { current: this.score, max: this.threshold });

        if(success) {
            this.toPlay.shift();
            var shouldWait = _.some(this.toPlay, function(key) { return key.id === justPlayed.id; });
            if(!shouldWait) dispatcher.trigger('keys::clear');

            dispatcher.trigger('key::success', justPlayed);

            if(this.toPlay.length !== 0)
                throw Exception("Game queue for aptitude style has exceeded maximum");

            this.clear();
            if(this.score >= this.threshold) this.win();
            else this.next();
        } else {
            dispatcher.trigger('key::miss', justPlayed);
            if(this.timer !== null) clearTimeout(this.timer);
            if(this.score <= 0) this.lose();
            else {
                var self = this;
                this.timer = setTimeout(function() { handleTimeout.call(self); }, this.timeout);
            }
        }
    };


    // For flow only : TODO use prototypes or something instead of this patchwork!!!
    function FLOW_generate(num) {

        // FIXME this should just be a min/max thing using original function
        //var cKeys = this.keyboard.getMiddleCKeys();
        var first = this.keyboard.keysById['3C'],
            last = this.keyboard.keysById['3B'],

            min = this.keyboard.keys.indexOf(first),
            max = this.keyboard.keys.indexOf(last);

        for(var x=0; x<num; x++) {
            n = undefined;
            do {
                n = Math.floor( Math.random() * ((max+1)-min) ) + min; // those parens are necessary!
            } while(this.keyboard.blacklist.indexOf(n + min) !== -1); // blacklist currently in MIDI
            this.toPlay.push(this.keyboard.keys[n]);
        }
    };


    function _createAptitudeGame(opts) {
        opts.numNotes = 1; // force single note play
        opts.reward = 1;
        opts.penalty = 3;
        opts.threshold = 20;

        var game = new Game(opts);
        game.type = types.APT;
        game.timeout = game.timeout || 4000; // let them think

        game.generate = APT_generate; // start with C notes only
        game.schedule = APT_schedule; // show many, play one
        game.update = APT_update; // clear all keys
        return game;
    }


    function _createMemoryGame(opts) {
        opts.numNotes = opts.numNotes || 3;
        opts.timeout = opts.timeout || 
            (opts.numNotes * (opts.keyboard.output ? 3000 : 2000));

        var game = new Game(opts);
        game.type = types.MELODY;

        game.generate = MELODY_generate;
        // TODO remove this once we subsume user-input behavior
        game.next = MELODY_next;
        return game;
    }


    // Flow is essentially one player real time, so we do NOT play the note
    // This means we also want a zero refresh time after playing the note
    // if possible...
    function _createFlowGame(opts) {
        opts.numNotes = 1;
        opts.timeout = opts.timeout || (opts.keyboard.output ? 3000 : 1000); 
        opts.noteDelay = 0;
        opts.soundNotes = false;

        var game = new Game(opts);
        game.type = types.FLOW;

        game.generate = FLOW_generate; // TODO prototypes
        return game;
    }


    return {
        createMemoryGame: _createMemoryGame,
        createFlowGame: _createFlowGame,
        createAptitudeGame: _createAptitudeGame
    }

});
