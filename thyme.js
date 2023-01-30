/**
 * Created by Wonseok Jung in KETI on 2022-12-27.
 */

global.conf = require('./conf.js');
global.sh_adn = require('./http_adn');

global.sh_state = 'rtvct';

global.mqtt_client = null;
if (my_simul === 'on') {
    my_drone_name = my_drone_name + '_Simul';
    global.started = false;
} else {
    global.started = true;
}

setTimeout(() => {
    require('./tele_rf');
}, 1000);
