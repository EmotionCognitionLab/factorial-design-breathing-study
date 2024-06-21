const https = require("https");

exports.createParticipant = async (event) => {
    let buff = Buffer.from(event.body, "base64");
    let eventBodyStr = buff.toString('UTF-8');
    const info = new URLSearchParams(eventBodyStr);
    const token = process.env.TOKEN;
    const newUserId = getRandomId();
    const data = {
        'token': token,
        'content': 'record',
        'action': 'import',
        'format': 'json',
        'type': 'flat',
        'overwriteBehavior': 'normal',
        'forceAutoNumber': false,
        // 'data': `[{"redcap_id":"${getRandomId()}","redcap_event_name":"participant_info_arm_1","first_name":"${info.get("firstName")}","last_name":"${info.get("lastName")}","email":"${info.get("email")}","phone":"${info.get("phone")}","status":"0","visit_1_scheduled":"${info.get("visit1")}","visit_2_scheduled":"${info.get("visit2")}","visit_scheduled_start_time":"${info.get("visitStart")}","visit_scheduled_end_time":"${info.get("visitEnd")}", "participant_info_complete":"2"}]`,
        'data': JSON.stringify([{"redcap_id":newUserId,"redcap_event_name":"participant_info_arm_1","first_name":info.get("firstName"),"last_name":info.get("lastName"),"email":info.get("email"),"phone":info.get("phone"),"status":"0","visit_1_scheduled":info.get("visit1"),"visit_2_scheduled":info.get("visit2"),"visit_scheduled_start_time":info.get("visitStart"),"visit_scheduled_end_time":info.get("visitEnd"), "participant_info_complete":"2"}]),
        'returnContent': 'count',
        'returnFormat': 'json'
    };

    const urlEncodedData = new URLSearchParams(data).toString();
    const options = {
        hostname: 'redcap.med.usc.edu',
        path: '/api/',
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(urlEncodedData),
            "Accept": "*/*"
        },
        method: 'POST'
    };

    const reqPromise = new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            console.log(`STATUS: ${res.statusCode}`);
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                console.log(`BODY: ${chunk}`);
            });
            res.on('end', () => {
                console.log('rc response complete');
                resolve();
            });
            res.on('aborted', () => {
                console.log('rc response aborted');
            });
        });
        req.on('error', (e) => {
            console.error('Error calling RC: ', e);
            reject();
        });
    
        req.end(urlEncodedData, 'utf8');
    });

    try {
        await reqPromise;
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/html',
            },
            body: `<html><head></head><body>New REDCap participant ${newUserId} created successfully.<br/><a href="https://redcap.med.usc.edu/redcap_v14.3.10/DataEntry/record_home.php?pid=13420">Go to REDCap</a></body></html>`
        };
    } catch (err) {
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/html',
            },
            body: `Call to REDCap failed with error ${err.message}`
        };
    }
}

exports.handleEvent = async (event) => {
    console.log(event.body);
}

const getRandomId = () => {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return capitalize(adj) + capitalize(noun);
}

const capitalize = (str) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

const adjectives = [
    'able',
    'agog',
    'airy',
    'alar',
    'alto',
    'arco',
    'arid',
    'arty',
    'auld',
    'avid',
    'away',
    'awed',
    'base',
    'bass',
    'bent',
    'best',
    'beta',
    'bias',
    'blae',
    'blue',
    'bold',
    'bone',
    'born',
    'boss',
    'buff',
    'busy',
    'calm',
    'camp',
    'chic',
    'clad',
    'cold',
    'cool',
    'cozy',
    'cute',
    'damp',
    'dear',
    'deep',
    'deft',
    'dirt',
    'done',
    'down',
    'dual',
    'east',
    'easy',
    'edgy',
    'epic',
    'even',
    'eyed',
    'fair',
    'fast',
    'fine',
    'firm',
    'five',
    'fond',
    'four',
    'free',
    'full',
    'game',
    'glad',
    'gold',
    'good',
    'grey',
    'hale',
    'half',
    'held',
    'hewn',
    'high',
    'home',
    'idle',
    'jade',
    'just',
    'keen',
    'kind',
    'lacy',
    'laic',
    'laid',
    'lank',
    'last',
    'late',
    'leal',
    'lean',
    'left',
    'less',
    'like',
    'live',
    'long',
    'lost',
    'loud',
    'made',
    'many',
    'midi',
    'mild',
    'mown',
    'near',
    'neat',
    'next',
    'nice',
    'nine',
    'nisi',
    'none',
    'numb',
    'oily',
    'open',
    'otic',
    'paid',
    'past',
    'pent',
    'pink',
    'port',
    'puff',
    'pure',
    'rank',
    'rare',
    'real',
    'roan',
    'rose',
    'ruly',
    'rust',
    'safe',
    'sage',
    'salt',
    'same',
    'self',
    'sent',
    'shod',
    'size',
    'skew',
    'skim',
    'snug',
    'soft',
    'sold',
    'solo',
    'some',
    'sour',
    'sure',
    'tame',
    'taut',
    'tidy',
    'tied',
    'toed',
    'torn',
    'true',
    'used',
    'void',
    'warm',
    'wary',
    'wavy',
    'well',
    'west',
    'wide',
    'wild',
    'winy',
    'wiry',
    'wise',
    'worn',
    'zero',
    'zoic',
];

const nouns = [
    'aba',
    'ace',
    'act',
    'adz',
    'age',
    'aid',
    'aim',
    'air',
    'ala',
    'alb',
    'ale',
    'alp',
    'ana',
    'ani',
    'ant',
    'arc',
    'are',
    'ark',
    'arm',
    'art',
    'ash',
    'asp',
    'auk',
    'avo',
    'awe',
    'awl',
    'awn',
    'baa',
    'bag',
    'ban',
    'bap',
    'bar',
    'bat',
    'bay',
    'bed',
    'bee',
    'ben',
    'bet',
    'bey',
    'bib',
    'bid',
    'bin',
    'bit',
    'boa',
    'bob',
    'bog',
    'boo',
    'bop',
    'bot',
    'bow',
    'box',
    'boy',
    'bud',
    'bun',
    'bur',
    'bus',
    'bye',
    'cab',
    'cad',
    'cam',
    'can',
    'cap',
    'car',
    'cat',
    'caw',
    'cgs',
    'chi',
    'cob',
    'cod',
    'cog',
    'col',
    'coo',
    'cos',
    'cot',
    'cry',
    'cub',
    'cud',
    'cue',
    'cul',
    'cup',
    'cur',
    'cut',
    'dab',
    'dad',
    'dam',
    'day',
    'den',
    'dew',
    'dig',
    'dip',
    'doe',
    'dol',
    'don',
    'dot',
    'dry',
    'dub',
    'due',
    'dug',
    'dun',
    'dye',
    'ear',
    'ebb',
    'eel',
    'eft',
    'egg',
    'ego',
    'elf',
    'elk',
    'ell',
    'elm',
    'emu',
    'end',
    'eon',
    'era',
    'erg',
    'ern',
    'eta',
    'eve',
    'ewe',
    'eye',
    'fad',
    'fan',
    'fee',
    'fen',
    'few',
    'fez',
    'fib',
    'fig',
    'fin',
    'fir',
    'fit',
    'fix',
    'fly',
    'foe',
    'fog',
    'fox',
    'fug',
    'fun',
    'fur',
    'gal',
    'gam',
    'gap',
    'gar',
    'gat',
    'gel',
    'gem',
    'gen',
    'get',
    'gib',
    'gig',
    'gin',
    'gnu',
    'gob',
    'gum',
    'guy',
    'ham',
    'hao',
    'hap',
    'hat',
    'haw',
    'hay',
    'hem',
    'hen',
    'hex',
    'hin',
    'hip',
    'hit',
    'hob',
    'hod',
    'hog',
    'hop',
    'hub',
    'hue',
    'hug',
    'hum',
    'hut',
    'ice',
    'ink',
    'ion',
    'ivy',
    'jab',
    'jag',
    'jam',
    'jar',
    'jaw',
    'jay',
    'jet',
    'jib',
    'jig',
    'job',
    'jog',
    'joy',
    'jug',
    'kat',
    'kea',
    'keg',
    'key',
    'kid',
    'kin',
    'kip',
    'kit',
    'kob',
    'kos',
    'lab',
    'lac',
    'lap',
    'law',
    'lea',
    'lee',
    'leg',
    'lek',
    'let',
    'leu',
    'lev',
    'lid',
    'lie',
    'lip',
    'lob',
    'log',
    'lot',
    'low',
    'lox',
    'lug',
    'lux',
    'lye',
    'man',
    'map',
    'mat',
    'mem',
    'mew',
    'mho',
    'mil',
    'mix',
    'moa',
    'mob',
    'mod',
    'moo',
    'mud',
    'mug',
    'mum',
    'nan',
    'nap',
    'nay',
    'net',
    'nib',
    'nim',
    'nip',
    'nit',
    'nod',
    'nog',
    'now',
    'nub',
    'nun',
    'nut',
    'oak',
    'oar',
    'oat',
    'oca',
    'ode',
    'ohm',
    'oil',
    'oka',
    'ola',
    'olm',
    'one',
    'ore',
    'out',
    'owl',
    'pad',
    'pan',
    'par',
    'pas',
    'pat',
    'paw',
    'pax',
    'pea',
    'peg',
    'pen',
    'pep',
    'pet',
    'pew',
    'phi',
    'pia',
    'pie',
    'pin',
    'pip',
    'pit',
    'ply',
    'pod',
    'poi',
    'pop',
    'pot',
    'pox',
    'psi',
    'pug',
    'pul',
    'pun',
    'pup',
    'pya',
    'pyx',
    'rad',
    'rag',
    'raj',
    'ram',
    'rap',
    'raw',
    'ray',
    'red',
    'rem',
    'rep',
    'rho',
    'rib',
    'rig',
    'rim',
    'rip',
    'roc',
    'rod',
    'roe',
    'row',
    'rub',
    'rue',
    'rug',
    'rum',
    'run',
    'rut',
    'rya',
    'rye',
    'sac',
    'sag',
    'sap',
    'saw',
    'sax',
    'say',
    'sea',
    'see',
    'sen',
    'set',
    'shy',
    'sip',
    'sir',
    'ski',
    'sky',
    'sol',
    'som',
    'son',
    'sop',
    'sou',
    'sow',
    'soy',
    'spy',
    'sty',
    'sum',
    'sun',
    'tab',
    'tad',
    'tag',
    'tam',
    'tan',
    'tap',
    'tau',
    'taw',
    'tax',
    'tea',
    'tee',
    'teg',
    'ten',
    'tic',
    'tie',
    'tin',
    'tip',
    'tod',
    'toe',
    'tom',
    'top',
    'tor',
    'tot',
    'tow',
    'toy',
    'tub',
    'tug',
    'tun',
    'two',
    'uke',
    'urn',
    'use',
    'vac',
    'van',
    'vow',
    'wad',
    'wag',
    'war',
    'waw',
    'wax',
    'way',
    'web',
    'wee',
    'why',
    'wig',
    'win',
    'wit',
    'woe',
    'yak',
    'yam',
    'yaw',
    'yea',
    'yen',
    'yes',
    'yew',
    'zap',
];