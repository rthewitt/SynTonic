define(['./dispatcher', 'underscore'], function(dispatcher, _) {


    // ===========================
    // WEB AUDIO API AND FUNCTIONS
    // ===========================
    
    var channel_max = 32;										// number of channels
    audioChannels = new Array();

    // used as const, was variable in float version of autoCorrelate
    const MIN_SAMPLES = 0;  // will be initialized when AudioContext is created.
    const GOOD_ENOUGH_CORRELATION = 0.9; // this is the "bar" for how close a correlation needs to be

    for (var a=0;a<channel_max;a++) {									// prepare the channels
        audioChannels[a] = new Array();
        audioChannels[a]['channel'] = new Audio();						// create a new audio object
        audioChannels[a]['finished'] = -1;							// expected end time for this channel
        audioChannels[a]['keyvalue'] = '';
    }


    // To be used with Whistle business
    function getUserMedia(opts, callback) {
        try {
            navigator.getUserMedia =
                navigator.getUserMedia ||
                navigator.webkitGetUserMedia ||
                navigator.mozGetUserMedia;
            navigator.getUserMedia(opts, callback, e => console.log('error getting stream'));
        } catch (e) {
            alert('getUserMedia threw exception :' + e);
        }
    }


    // Why is this in underscore notation?
    // TODO answer questions
    // 1) when do I want multisound vs MIDI play?
    // 2) can WebAudio listen to MIDI Api to avoid low-level play?
    function play_multi_sound(s) {
        for (var a=0; a < audioChannels.length; a++) { 
            var now = new Date(); 
            if(audioChannels[a]['finished'] < now.getTime()) { // is this channel finished?
                
                try {		
                    audioChannels[a]['finished'] = now.getTime() + 1000;
                    audioChannels[a]['channel'] = document.getElementById(s);
                    audioChannels[a]['channel'].currentTime = 0;
                    audioChannels[a]['channel'].volume=1;
                    audioChannels[a]['channel'].play();
                    audioChannels[a]['keyvalue'] = s; 
                } catch(v) {
                    console.log(v.message); 
                }
                break;
            }
        }
    }


    function channelStop(idx, when, dropVolume) {
        if(dropVolume) audioChannels[a]['channel'].volume=0;
        setTimeout(function() {
            try {
                audioChannels[idx]['channel'].pause()
                audioChannels[idx]['channel'].currentTime = 0;
            } catch(ex) { console.log(ex); }
        }, when);
    }

    function stop_multi_sound(s, sender) { 
        for (var a=0; a < audioChannels.length; a++) { 
            if (audioChannels[a]['keyvalue'] == s) { // is this channel finished?
                try { 
                    audioChannels[a]['channel'] = document.getElementById(s);
                    var wasMouse = sender != undefined && sender == 'mouse';
                    channelStop(a, wasMouse ? 2500 : 500, wasMouse);
                } catch(v) {	
                    console.log(v.message); 
                }
                break;
            }
        }
    }

    // is there a better algorithm?  Is this fft?
    function autoCorrelate( buf, sampleRate ) {
        var SIZE = buf.length;
        var MAX_SAMPLES = Math.floor(SIZE/2);
        var best_offset = -1;
        var best_correlation = 0;
        var rms = 0;
        var foundGoodCorrelation = false;
        var correlations = new Array(MAX_SAMPLES);

        for (var i=0;i<SIZE;i++) {
            var val = buf[i];
            rms += val*val;
        }
        rms = Math.sqrt(rms/SIZE);
        if (rms<0.01) // not enough signal
            return -1;

        var lastCorrelation=1;
        for (var offset = MIN_SAMPLES; offset < MAX_SAMPLES; offset++) {
            var correlation = 0;

            for (var i=0; i<MAX_SAMPLES; i++) {
                correlation += Math.abs((buf[i])-(buf[i+offset]));
            }
            correlation = 1 - (correlation/MAX_SAMPLES);
            correlations[offset] = correlation; // store it, for the tweaking we need to do below.
            if ((correlation>GOOD_ENOUGH_CORRELATION) && (correlation > lastCorrelation)) {
                foundGoodCorrelation = true;
                if (correlation > best_correlation) {
                    best_correlation = correlation;
                    best_offset = offset;
                }
            } else if (foundGoodCorrelation) {
                // short-circuit - we found a good correlation, then a bad one, so we'd just be seeing copies from here.
                // Now we need to tweak the offset - by interpolating between the values to the left and right of the
                // best offset, and shifting it a bit.  This is complex, and HACKY in this code (happy to take PRs!) -
                // we need to do a curve fit on correlations[] around best_offset in order to better determine precise
                // (anti-aliased) offset.

                // we know best_offset >=1, 
                // since foundGoodCorrelation cannot go to true until the second pass (offset=1), and 
                // we can't drop into this clause until the following pass (else if).
                var shift = (correlations[best_offset+1] - correlations[best_offset-1])/correlations[best_offset];
                return sampleRate/(best_offset+(8*shift));
            }
            lastCorrelation = correlation;
        }
        if (best_correlation > 0.01) {
            // console.log("f = " + sampleRate/best_offset + "Hz (rms: " + rms + " confidence: " + best_correlation + ")")
            return sampleRate/best_offset;
        }
        return -1;
    //  var best_frequency = sampleRate/best_offset;
    }

    function noteFromPitch( frequency ) {
        var noteNum = 12 * (Math.log( frequency / 440 )/Math.log(2) );
        return Math.round( noteNum ) + 69;
    }

    function frequencyFromNoteNumber( note ) {
        return 440 * Math.pow(2,(note-69)/12);
    }

    function centsOffFromPitch( frequency, note ) {
        return Math.floor( 1200 * Math.log( frequency / frequencyFromNoteNumber( note ))/Math.log(2) );
    }



    return {
        playSound: play_multi_sound,
        stopSound: stop_multi_sound,
        getUserMedia: getUserMedia,
        noteFromPitch: noteFromPitch,
        frequencyFromNoteNumber: frequencyFromNoteNumber,
        centsOffFromPitch: centsOffFromPitch,
        autoCorrelate: autoCorrelate
    }

});
