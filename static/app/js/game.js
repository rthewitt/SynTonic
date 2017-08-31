define(['jquery', 'underscore', 'rxjs', 'vexflow', './sheet', './dispatcher', './util'], function($, _, Rx, Vex, MusicSheet, dispatcher, util) {

    const DURATIONS = { 'q': 5 }

    const MODIFIED_NOTES = {
        '#': ['F', 'C', 'G', 'D', 'A', 'E', 'B'],
        'b': ['B', 'E', 'A', 'D', 'G', 'C', 'F']
    };

    var gameStop, 
        gameStart,
        instrument,
        scoreBoard, 
        progressBar;

    function Slot(notes, keysig) {
        let VF = Vex.Flow;
        let duration = 'q'; // hardcoded for now
        let vexNoteKeys = notes.map(n => n.name.replace('s','#')+'/'+n.octave);
        this.vexNote = new VF.StaveNote({ clef: 'treble', keys: vexNoteKeys, duration: duration, auto_stem: true });

        this.notes = notes;
        this.noteProps = [];

        let keySpec = !!keysig ? VF.keySignature.keySpecs[keysig] : null;
        notes.forEach( (n, i) => {
            let acc = this.vexNote.keyProps[i].accidental;
            if(acc) this.vexNote.addAccidental(i, new VF.Accidental(acc));
            let isModified = false;
            if(!!keySpec && !!keySpect.acc) {
                let modifiedNotes = MODIFIED_NOTES[keySpec.acc].slice(0, keySpec.num);
                isModified = modifiedNotes.indexOf(n.name) !== -1;
            }
            this.noteProps.push({ duration: duration, playCount: 0, signatureKeyHint: isModified });
        });
    }


    var setNoProgress = () => updateProgressBar(0, 1);
    var setMaxProgress = () => updateProgressBar(1, 1);

    function updateProgressBar(cur, max) {
        let p = Math.round(100 * (cur / max));
        progressBar.css('width', ''+p+'%');
        if(p < 10) {
            progressBar.removeClass('progress-bar-info progress-bar-success progress-bar-warning');
            progressBar.addClass('progress-bar-danger active');
        } else if(p < 20) {
            progressBar.removeClass('progress-bar-info progress-bar-success progress-bar-danger active');
            progressBar.addClass('progress-bar-warning');
        } else {
            progressBar.removeClass('progress-bar-info progress-bar-danger progress-bar-warning active');
            progressBar.addClass('progress-bar-success');
        }
    }


    // TODO get this once, not every single time
    // benefit is that I could cycle scales as I go
    function generateSimple() {
        // consider mode where we IMITATE a key by only using those accidentals. - what mechanic though?
        let scale = util.getScaleForKey(this.keySig ? this.keySig : 'C'); // C3-C4 when playing "All Notes"
        let min = 0,
            max = scale.length-1, // should be 6 (7 notes)
            n = Math.floor( Math.random() * ((max+1)-min) ) + min; // those parens are necessary!
            noteName = scale[n][0],
            octave = scale[n][1];

        // All notes are fair game if no keysig
        if(!this.keySig && Math.random() < 0.5) {
            noteName += Math.random() < 0.5 ? 's' : 'b';
        }

        return Rx.Observable.just(new Slot(instrument.notesById[''+octave+noteName], this.keySig));
    }


    function Game(opts) {
        initialize(opts.instrument);
        let gt = util.gameTypes; 

        this.type = opts.type;
        this.keySig = opts.keySig;

        this.pianoHints = opts.pianoHints;

        this.reward = 1;
        this.penalty = 0;

        switch(this.type) {
            case gt.FLOW:
                this.streamSpeed = 10;
                this.generate = generateSimple;
                break;
            case gt.SANDBOX:
                this.setSpeed((opts.speed || 7)); // positive values
                this.generate = generateSimple;
                break;
            case gt.STAMINA:
                this.streamSpeed = 7;
                this.generate = generateSimple;
                break;
            case gt.SCALES:
                this.streamSpeed = 0;
                this.generate = generateScales;
                break;
        }


        let X = n => n.vexNote.getAbsoluteX(),
            X_infinity= n => { try { return X(n) } catch(e) { return Infinity; } },
            Width = n => n.vexNote.width,
            Padding = n => n.vexNote.left_modPx; // accidentals, etc
            WidthAndPadding = n => Width(n) + Padding(n);

        var self = this;

        var GAME_TIME = 500;


        const stop$ = Rx.Observable.fromEvent(gameStop, 'click').startWith(false);

        const TICKER_INTERVAL = 34;

        const ticker$ = Rx.Observable.interval(TICKER_INTERVAL, Rx.Scheduler.requestAnimationFrame).map(() => ({
            time: Date.now(),
            deltaTime: null
        }))
        .scan( (prev, cur) => ({
            time: cur.time,
            deltaTime: (cur.time, prev.time) / 1000
        }));


        let START_ARRAY = [['4Fs'],['4G'],['4A'],['4B'],['5D'],['5E'],['5F'],['5G'],['5A'],['5B'],['5F'],['4Fs'],['4G'],['4A'],['4B']];
        //let START_ARRAY = [['4C', '4E'],['4D'],['4C','4E'],['4F'],['4G'],['4A'],['4B']];

        // TODO simply construct INITIAL_STATE from passed options
        // for song, set futureSlots whole as we do here
        // set initial speed, etc
        INITIAL_STATE = {
            renderStart: 500, // MusicSheet.startNoteX, // REPLACE THIS once we have "first attempt starts the game"
            notesToRender: {
                futureSlots: START_ARRAY.concat(START_ARRAY).map( noteIds =>  new Slot(noteIds.map( id => instrument.notesById[id]))),
                pastSlots: [],
                badSlots: []
            },
            stopped: false,
            time: GAME_TIME,
            score: 0,
            missed: false
        }

        // udpdate the state of the world
        const world$ = ticker$
            .withLatestFrom(stop$)
            .scan((state, [tick, stop]) => {

                // TODO tighten this loop
                let n = state.notesToRender,
                    future = n.futureSlots,
                    past = n.pastSlots,
                    bad = [], 
                    score = state.score; 
            
                // why does it go from 75 to infinity immediately? 
                // FIXME TODO HACK only testing bug - the real trouble is this could mask real bugs
                if(X_infinity(future[0]) === Infinity) return state;

                let slot = future[0], // TODO handle case where nothing is left to play
                    curPlayed = instrument.getCurrentNotes();

                let targetNotes = slot.notes;

                // This is... interesting. We still use an array / queue, but really only allowing a single
                // entry at this point by shifting on success.
                let failureNotes = _.difference(curPlayed, targetNotes);
                if(failureNotes.length) {
                    bad.push( new Slot(failureNotes) );
                }
                    

                let playedAll = true;
                targetNotes.forEach( ( target, ti ) => {
                    let played = curPlayed.some( p => p === target);
                    let props = slot.noteProps[ti];
                    if(played) {
                        if(++props.playCount < DURATIONS[props.duration]) playedAll = false;
                    } else {
                        playedAll = false;
                        props.playCount = 0;
                    }
                });

                if(playedAll) {
                    score++;
                    // KEYBOARD SPECIFIC HACK TO AVOID REGISTERING AS MULTIPLE KEYPRESSES
                    //successKeys.forEach( k => keyboard.ignoreKeyState(k));
                    past.push(future.shift());
                }

                let nextSlot = future[0], // next slot to play, could be same as slot
                    cutoff = MusicSheet.startNoteX - Width(nextSlot), // if we restore at-your-own-pace, return startNote + someBuffer (10px)
                    curPos = X_infinity(nextSlot); // Infinity avoids exception on eager player presses

                if(past.length && X(past[0]) < MusicSheet.startNoteX-75) past.shift();

                let firstSlot = past.length ? past[0] : future[0];
                renderPos = X_infinity(firstSlot) - self.streamSpeed - WidthAndPadding(firstSlot);


                return { 
                    renderStart: renderPos,
                    notesToRender: {
                        futureSlots: future,
                        pastSlots: past,
                        badSlots: bad
                    },
                    playedAll: playedAll,
                    stopped: !!stop,
                    time: playedAll && score % 5 == 0 ? GAME_TIME : state.time - 1, // relay 
                    score: score,
                    missed: curPos < cutoff
                } 
            }, INITIAL_STATE);


        // this will render everything in update.
        const game = Rx.Observable
            .combineLatest(ticker$, world$)
            .sample(TICKER_INTERVAL)
            .subscribe(([ticker, world]) => {
                MusicSheet.renderStaves(world.notesToRender, self.keySig, world.renderStart),
                updateProgressBar(world.time, GAME_TIME) 

                scoreBoard.text(''+world.score);
                if(world.time <= 0 || world.stopped || world.missed) game.dispose();
                if(!!world.relay) console.log('RELAY');
            });

            //renderSheetEmpty();
    }


    Game.prototype.setSpeed = function(speed) {
        let s;
        if(speed > 15) s = 15;
        else if(speed < 1) s = 1;
        else s = speed;
        this.streamSpeed = s;
    }


    // when the app / dom is ready...
    function initialize(inst) {
        gameStop = $('.stop-game');
        progressBar = $('#progress-meter');
        scoreBoard = $('#scoreboard');

        // TODO see main.js for TODO
        // remove UI functions from this file
        console.log('should have set instrument...');
        instrument = inst; // naming collision caused global undefined

        setMaxProgress();
    }

    return {
        Game: Game
    }

});
