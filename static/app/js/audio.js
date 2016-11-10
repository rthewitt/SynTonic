define(['./dispatcher', 'underscore'], function(dispatcher, _) {


    // ===========================
    // WEB AUDIO API AND FUNCTIONS
    // ===========================
    
    var channel_max = 32;										// number of channels
    audioChannels = new Array();

    for (var a=0;a<channel_max;a++) {									// prepare the channels
        audioChannels[a] = new Array();
        audioChannels[a]['channel'] = new Audio();						// create a new audio object
        audioChannels[a]['finished'] = -1;							// expected end time for this channel
        audioChannels[a]['keyvalue'] = '';
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

    return {
        playSound: play_multi_sound,
        stopSound: stop_multi_sound
    }

});
