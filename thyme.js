/**
 * Created by Wonseok Jung in KETI on 2022-12-27.
 */

global.conf = require('./conf.js');
global.sh_adn = require('./http_adn');

global.sh_state = 'rtvct';

global.mqtt_client = null;

global.started = false;

setTimeout(() => {
    require('./tele_rf');
}, 1000);
