define(['jquery', 'rxjs', 'vexflow', './sheet', './dispatcher', './util'], function($, Rx, Vex, MusicSheet, dispatcher, util) {

    const MODIFIED_NOTES = {
        '#': ['F', 'C', 'G', 'D', 'A', 'E', 'B'],
        'b': ['B', 'E', 'A', 'D', 'G', 'C', 'F']
    };

    var gameStop, 
        gameStart,
        keyboard,
        scoreBoard, 
        progressBar;


    function createNoteFromPianoKey(pianoKey) {
        // TODO align these octave IDs - there is no need for strings or double zeros
        if(pianoKey.octaveId == '00') {
            alert('TODO align octaveIds, HTML, and Vex');
            throw Exception('TODO');
        }
        return new Note(pianoKey.note, parseInt(pianoKey.octaveId)); // no keysig, because keysig on the constructor modifies the note based on lookup table, to "simplify" generation.
    }

    // stub so that our API is not confusing (vexNotes vs Note Notes)
    // will go away if and when we use "inheritance" - still hesitant on that
    function stubNote(pianoKey, flavor) {
        return {
            status: flavor,
            vexNote: util.getVexNoteForPianoKey(pianoKey),
            key: null
        }
    }
    var badNote = (p) => stubNote(p, 'failure');
    var successNote = (p) => stubNote(p, 'success');

    // fake note for padding, should be in sheet / graphics
    function phantomNote(pianoKey) {
        return {
            status: 'ghost',
            vexNote: util.getGhostNoteForPianoKey(pianoKey),
            key: null
        }
    }

     // Note: object to be rendered on staff
     // has pointer to relevant key
     // octave is coerced to string so can be int/string. This allows 00 to match current HTML
    function Note(noteName, octave, keysig) {
        let VF = Vex.Flow;
        this.status = null;
        this.vexNote = new VF.StaveNote({ clef: 'treble', keys: [noteName.replace('s', '#')+'/'+(octave+1)], duration: 'q', auto_stem: true });

        let keySpec = !!keysig ? VF.keySignature.keySpecs[keysig] : null;

        let pKeyId = ''+octave+noteName;

        var self = this;
        this.vexNote.keys.forEach( (n,i) => {
            isModified = false;

            // actualy display the accidental if one is present
            let acc = self.vexNote.keyProps[i].accidental;
            if(!!acc) self.vexNote.addAccidental(i, new VF.Accidental(acc));

            // if there's a better (vexflow) way to do this, I don't know of it
            // we don't want to set render properities outside of render functions
            // so setting and forgetting the style is inappropriate
            if(!!keySpec && !!keySpec.acc) {
                let modifiedNotes = MODIFIED_NOTES[keySpec.acc].slice(0, keySpec.num);
                if(modifiedNotes.indexOf(noteName) !== -1) {
                    pKeyId = '' + octave + noteName + (keySpec.acc === '#' ? 's' : 'b');
                    isModified = true;
                }
            }
            self.vexNote.keyProps[i].signatureKeyHint = isModified;
        });
        this.key = keyboard.keysById[pKeyId];
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


    // TODO merge these generate functions, nearly identtical now
    // TODO get this once, not every single time
    // benefit is that I could cycle scales as I go
    function generateScales() {
        let scale = util.getScaleForKey(this.key);
        var self = this;
        return Rx.Observable.fromArray(scale) 
            .map( n_o  => new Note(n_o[0], n_o[1], self.key)).do( n => {
                n.vexNote.keyProps.forEach( k=> {
                    k.noStyle = true;
                });
            });
    }


    // TODO get this once, not every single time
    // benefit is that I could cycle scales as I go
    function generateSimple() {
        // consider mode where we IMITATE a key by only using those accidentals. - what mechanic though?
        let scale = util.getScaleForKey(this.key ? this.key : 'C'); // C3-C4 when playing "All Notes"
        let min = 0,
            max = scale.length-1, // should be 6 (7 notes)
            n = Math.floor( Math.random() * ((max+1)-min) ) + min; // those parens are necessary!
            noteName = scale[n][0],
            octave = scale[n][1];

        // All notes are fair game if no keysig
        if(!this.key && Math.random() < 0.5) {
            noteName += Math.random() < 0.5 ? 's' : 'b';
        }

        return Rx.Observable.just(new Note(noteName, octave, this.key));
    }


    function Game(opts) {
        initialize(opts.keyboard);
        let gt = util.gameTypes; 

        this.type = opts.type;
        // TODO change this and all occurences to keysig to avoid ambiguity with Note.key / pianoKey
        this.key = opts.key;

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


        // more concise code
        let kb = keyboard;
            clearAllKeys = kb.clearAllKeys.bind(kb),
            activateKey = kb.activateKey.bind(kb),
            generate = this.generate.bind(this);

        clearAllKeys();

        let X = n => n.vexNote.getAbsoluteX(),
            X_infinity= n => { try { return X(n) } catch(e) { return Infinity; } },
            Width = n => n.vexNote.width,
            Padding = n => n.vexNote.left_modPx; // accidentals, etc
            WidthAndPadding = n => Width(n) + Padding(n);

        var self = this;
/*

        // "generator" for notes
        var notegen = new Rx.Subject();

        // TODO create simple function API so that we don't require
        // domain knowledge elsewhere in the code to take advantage of this
        let sourceNotes = notegen.flatMap( (thrust) => {
            if(!thrust) return generate();
            if(thrust instanceof Note) return Rx.Observable.just(thrust);
            let requested = [], n=thrust;
            if(typeof thrust === 'number') {
                for(let i=0; i<n; i++) requested.push(generate());
                return requested[0].merge.apply(requested.slice(1));
            }
            throw Exception('Cannot generate from thrusted value='+thrust+'of type '+(typeof thrust));
        });

        let tonic = this.key ? util.getScaleForKey(this.key)[0] : ['C', 3],
            startNote = new Note(tonic[0], tonic[1], this.key);

        notegen.onNext(this.type === gt.SCALES ? undefined : startNote);
        activateKey(startNote.key);
        if(this.type !== gt.SCALES) notegen.onNext(11);

        MusicSheet.renderStaves(playQueue, this.key);
        scoreBoard.text('0');
*/


        var GAME_TIME = 500;


        function resolvePressed(target, pressed) {
            if(!pressed.qwerty) return pressed;
            else if(keyboard.isSameNote(target, pressed)) return target;
            else return keyboard.keysById[target.id.replace(target.note, pressed.note)];
        }



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


        let START_ARRAY = ['C','D','E','F','G','A','B'];

        INITIAL_STATE = {
            renderStart: 500, // MusicSheet.startNoteX, // REPLACE THIS once we have "first attempt starts the game"
            notesToRender: {
                futureNotes: START_ARRAY.concat(START_ARRAY).map( n => new Note(n, 3)),
                faultyNotes: [],
                floatyNotes: [],
                fluffyNotes: [] // phantom, right-justification for reverse ATM
            },
            stopped: false,
            time: GAME_TIME,
            successKeys: [],
            failureKeys: [],
            score: 0,
            missed: false
        }

        // udpdate the state of the world
        const world$ = ticker$
            .withLatestFrom(stop$)
            .scan((state, [tick, stop]) => {

                // TODO tighten this loop
                let n = state.notesToRender,
                    future = n.futureNotes,
                    floaty = n.floatyNotes,
                    faulty = n.faultyNotes,
                    score = state.score, 
                    successKeys = [], failureKeys = []; // this turn only, 
            
                /* 
                 * success/failure would be redundant - dervied from floaty,future - if we didnt' reset them each time 
                 * status/stale could be reinstated if not an abuse of mutation, especially since it is still render-related
                 * we may just cycle though on floaty and set stale to true when decrementing the counter we considered
                 * for timing / duration mechanic.
                 */

                if(X_infinity(future[0]) === Infinity) return state; // FIXME TODO HACK only testing bug

                let target = future[0],
                    numPressed = keyboard.numPressed(),
                    playedTarget = numPressed === 1 && keyboard.isPressed(target.key);

                if(playedTarget) {
                    floaty.push(future.shift());
                    score++;
                    successKeys.push(target.key);
                    faulty = []; // reset mistakes
                } else if(numPressed > 0) {
                    keyboard.getPressedKeys().forEach(failKey => {
                        failureKeys.push(failKey)
                        faulty.push( createNoteFromPianoKey(failKey) ); // TODO if PianoKey <==> Note relations exist, this will make more sense
                    });
                }


                let nextNote = future[0],
                    cutoff = MusicSheet.startNoteX - Width(nextNote), // if we restore at-your-own-pace, return startNote + someBuffer (10px)
                    curPos = X_infinity(nextNote); // we don't want offscreen Vex notes to throw exception on eager player presses

                if(floaty.length && X(floaty[0]) < MusicSheet.startNoteX-75) floaty.shift();

                let firstNote = floaty.length ? floaty[0] : future[0];
                renderPos = X_infinity(firstNote) - self.streamSpeed - WidthAndPadding(firstNote);


                return { 
                    renderStart: renderPos, // maybe move this entirely into render function...
                    notesToRender: {
                        futureNotes: future,
                        floatyNotes: floaty,
                        faultyNotes: faulty,
                        fluffyNotes: []
                    },
                    stopped: !!stop,
                    time: playedTarget && score % 5 == 0 ? GAME_TIME : state.time - 1, // relay 
                    successKeys: successKeys,
                    failureKeys: failureKeys,
                    score: score,
                    missed: curPos < cutoff // TODO remove, this can be derived elsewhere
                } 
            }, INITIAL_STATE);


        // this will render everything in update.
        const game = Rx.Observable
            .combineLatest(ticker$, world$)
            .sample(TICKER_INTERVAL)
            .subscribe(([ticker, world]) => {
                MusicSheet.renderStaves(world.notesToRender, self.key, world.renderStart),
                updateProgressBar(world.time, GAME_TIME) 

                // TODO move to duration notes, and delete this "set not pressed" hack from keyboard
                world.successKeys.forEach( k => {
                    keyboard.successKey(k);
                    keyboard.ignoreKeyState(k); // state hack to allow presses longer than update interval
                });
                world.failureKeys.forEach( k => {
                    keyboard.failKeyForever(k);
                    keyboard.ignoreKeyState(k); // state hack to allow presses longer than update interval
                });

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
    function initialize(instrument) {
        gameStop = $('.stop-game');
        progressBar = $('#progress-meter');
        scoreBoard = $('#scoreboard');

        // TODO see main.js for TODO
        // remove UI functions from this file
        keyboard = instrument;

        setMaxProgress();
    }

    return {
        Game: Game
    }

});
