/* ============================================================
   ASCII CITY — story.js
   Pure data: the phone thread, one ambient beat per point of
   interest, relay captions and tour narration. No DOM, no deps.
   Consumed by ui.js.
   ============================================================ */
(function (global) {
"use strict";

var AC_STORY = {
  version: 1,
  opening: "phone_ring",

  relayLines: [
    "PUBLIC RELAY // HANDSHAKE OK",
    "PUBLIC RELAY // ROUTING\nplease keep limbs inside the character set",
    "PUBLIC RELAY // REINDEXING STREET\nyou were always here",
    "PUBLIC RELAY // TRANSFER COMPLETE\nwelcome back to the pavement",
    "PUBLIC RELAY // SIGNAL HELD\nthe rain has not noticed",
    "PUBLIC RELAY // LAST MILE\nthank you for walking"
  ],

  tourLines: [
    "You are being shown the city at the speed the city uses.",
    "Avenue traffic holds its light. Nobody is in a hurry in particular.",
    "The elevated line runs whether or not anyone is riding it.",
    "Every lit window is somebody deciding about soup.",
    "The blocks repeat. The weather does not repeat.",
    "Somewhere a kettle. Somewhere a night shift clocking on.",
    "Signs advertise things that were true in 1994.",
    "Pedestrians cross on the walk signal out of pure habit.",
    "The river does not have a name the city agrees on.",
    "You may take the controls at any time. Just move."
  ],

  beats: {

    /* ---------- main thread ---------- */
    phone_ring: {
      label: "07::RELAY_MESSAGE",
      title: "PUBLIC PHONE — IT IS RINGING",
      copy: "The receiver is moving on its own, the way a receiver does when nobody has answered it for some time. The cord is dry. The dial tone underneath the ringing sounds patient rather than impatient.",
      choices: [
        { text: "ANSWER IT", goto: "first_call" },
        { text: "LET IT RING", close: true }
      ]
    },

    first_call: {
      label: "07::RELAY_MESSAGE",
      title: "DISPATCH, PROBABLY",
      copy: "\"You're the one on foot. Good. There is a parcel at the corner store and it is meant to be somewhere else by now. It isn't heavy. It's mostly paperwork about a building that has not been built yet.\"",
      choices: [
        { text: "WHO IS THIS", goto: "who_calls" },
        { text: "WHERE DO I GO", goto: "route" },
        { text: "I'M NOT A COURIER", goto: "decline" }
      ]
    },

    who_calls: {
      label: "07::RELAY_MESSAGE",
      title: "A VOICE, UNBOTHERED",
      copy: "\"Dispatch. Same as last time.\" A pause with actual weight to it. \"There was no last time for you, I know. From here the paperwork says there was, and the paperwork has been correct about weather, at least.\"",
      choices: [
        { text: "FINE. THE STORE", goto: "route" },
        { text: "NO THANK YOU", goto: "decline" }
      ]
    },

    route: {
      label: "07::RELAY_MESSAGE",
      title: "ROUTE ASSIGNED",
      copy: "\"Nearest store. Ask for the parcel with the wet corner. Take the rail if the rain has started, take the street if it hasn't, it makes no difference to the parcel and a large difference to you.\"",
      choices: [
        { text: "WALK IT", travel: "poi", say: "You walk. The rain holds off, out of politeness.", goto: "delivered" },
        { text: "TAKE THE RAIL", travel: "station", say: "The carriage is warm and empty and smells faintly of toast.", goto: "delivered" }
      ]
    },

    delivered: {
      label: "08::TERMINUS",
      title: "PARCEL RECEIVED",
      copy: "The counter keeps one lamp on for deliveries. The parcel is signed for by a machine that stamps your hand instead of the other way around. Somewhere above you, a floor is added to a building nobody ordered.",
      choices: [
        { text: "BACK TO THE STREET", close: true },
        { text: "ASK ABOUT THE BUILDING", goto: "building" }
      ]
    },

    building: {
      label: "08::TERMINUS",
      title: "THE BUILDING REMEMBERS",
      copy: "\"It remembers its own address and prefers the old one,\" says the machine, which was not asked a question and does not apologise. The lamp flickers once, in what you choose to read as agreement.",
      choices: [
        { text: "BACK TO THE STREET", close: true }
      ]
    },

    decline: {
      label: "08::TERMINUS",
      title: "THE LINE GOES QUIET",
      copy: "You hang up. The city does not react. Traffic completes its cycle, a pedestrian crosses against the light, and the parcel is collected by someone else who was also, until a moment ago, on foot and unbothered.",
      choices: [
        { text: "WALK ANYWAY", close: true }
      ]
    },

    phone_second: {
      label: "07::RELAY_MESSAGE",
      title: "PUBLIC PHONE — STILL OPEN",
      copy: "The line is still connected to nothing in particular. Occasionally a bus passes on the other end of it, very far away, and the number of stops it takes is longer than the street you are standing on.",
      choices: [
        { text: "HANG UP", close: true },
        { text: "LISTEN", goto: "phone_third" }
      ]
    },

    phone_third: {
      label: "07::RELAY_MESSAGE",
      title: "A BUS, EVENTUALLY",
      copy: "It arrives. The announcement is for a stop that shares its name with a district you have already walked through, spoken by a voice that has said it eleven thousand times and still says it kindly.",
      choices: [
        { text: "SAY THANK YOU", goto: "phone_thanks" },
        { text: "HANG UP", close: true }
      ]
    },

    phone_thanks: {
      label: "07::RELAY_MESSAGE",
      title: "YOU ARE THANKED IN RETURN",
      copy: "\"Not at all,\" says the bus, or the recording, or the city using the recording as a mouth. \"You are the four hundredth person to say it. The other three hundred and ninety-nine were also talking to a bus.\"",
      choices: [
        { text: "BACK TO THE STREET", close: true }
      ]
    },

    /* ---------- ambient: one per POI kind ---------- */
    at_mart: {
      label: "03::LOCAL_CONTEXT",
      title: "CORNER STORE, ALL HOURS",
      copy: "The floor by the door has been mopped and left slightly too wet, which is the correct amount of wet. A radio is on for the benefit of one person who is not listening to it.",
      choices: [
        { text: "GO IN A MOMENT", close: true },
        { text: "READ THE WINDOW", goto: "mart_window" }
      ]
    },
    mart_window: {
      label: "03::LOCAL_CONTEXT",
      title: "NOTICE BOARD",
      copy: "Lost cat, answers to a sound like a drawer closing. Piano lessons, downward only. A hand-written sign that says EVERYTHING MUST GO and has been there since the building opened.",
      choices: [
        { text: "STEP BACK", close: true }
      ]
    },

    at_bar: {
      label: "03::LOCAL_CONTEXT",
      title: "THE DOOR IS HEAVY",
      copy: "Warm air and a glass being rinsed. Inside, three people are having the same quiet argument with their own evening, and the bartender has decided to let them win.",
      choices: [
        { text: "MAYBE LATER", close: true },
        { text: "GO IN", goto: "bar_in" }
      ]
    },
    bar_in: {
      label: "03::LOCAL_CONTEXT",
      title: "A STOOL NEAR THE WINDOW",
      copy: "You are given a menu that is mostly a photograph of something somebody else ordered. The window faces the street, so you can watch the version of tonight you decided not to have.",
      choices: [
        { text: "BACK OUT", close: true }
      ]
    },

    at_station: {
      label: "03::LOCAL_CONTEXT",
      title: "PLATFORM ENTRANCE",
      copy: "The escalator has been out of order for long enough that people now walk up it in a single polite lane. A timetable on the wall lists trains that were withdrawn with the timetable's approval.",
      choices: [
        { text: "RIDE THE LINE", travel: "board", say: "You step aboard. The city tilts, then agrees to stay level." },
        { text: "STAY AT STREET LEVEL", close: true }
      ]
    },

    at_terminal: {
      label: "03::LOCAL_CONTEXT",
      title: "CAB RANK",
      copy: "Four marked bays, one occupied, the queue held by a cone that has been promoted past its original purpose. The driver is reading the back of a receipt like it is a long-form article.",
      choices: [
        { text: "GET IN", travel: "cab", say: "The driver nods and does not ask where, because the meter already knows." },
        { text: "WAIT FOR THE NEXT ONE", close: true }
      ]
    },

    at_pad: {
      label: "03::LOCAL_CONTEXT",
      title: "SKY PAD",
      copy: "A painted circle, a windsock with strong opinions, and a bench for exactly this situation. The city looks different from here, mostly because it is further away from your problems.",
      choices: [
        { text: "CALL ONE DOWN", travel: "sky", say: "It arrives on time, which is the loudest thing about it." },
        { text: "SIT ON THE BENCH", goto: "pad_bench" }
      ]
    },
    pad_bench: {
      label: "03::LOCAL_CONTEXT",
      title: "THE BENCH IS ENOUGH",
      copy: "You sit for the length of one train passing underneath. Nothing is delivered, nothing is signed for, and the rain takes its turn somewhere else for a while.",
      choices: [
        { text: "BACK TO THE STREET", close: true }
      ]
    },

    at_viewpoint: {
      label: "03::LOCAL_CONTEXT",
      title: "OVERLOOK",
      copy: "The whole grid at once, going in every direction, each window a decision somebody made about lighting. From up here the streets look like a diagram of a city rather than a city.",
      choices: [
        { text: "LOOK LONGER", goto: "view_long" },
        { text: "HEAD BACK DOWN", close: true }
      ]
    },
    view_long: {
      label: "03::LOCAL_CONTEXT",
      title: "SECOND LOOK",
      copy: "Now that the scale has stopped impressing you, the small things arrive: a person crossing against the light, a sign with one letter out, a taxi waiting for a passenger who is saying goodbye inside.",
      choices: [
        { text: "HEAD BACK DOWN", close: true }
      ]
    },

    at_archive: {
      label: "03::LOCAL_CONTEXT",
      title: "READING ROOM",
      copy: "A desk lamp per shelf, and the particular hush of paper that has been handled carefully by people who are not here. The catalogue terminal is on and has been on since the last person left.",
      choices: [
        { text: "TOUCH NOTHING", close: true },
        { text: "OPEN A DRAWER", goto: "archive_drawer" }
      ]
    },
    archive_drawer: {
      label: "03::LOCAL_CONTEXT",
      title: "DRAWER 14",
      copy: "Street names, in order, including several that were only ever proposed by one councillor and used on exactly four signs. One of those signs is still up and the neighbourhood has accepted it.",
      choices: [
        { text: "CLOSE IT GENTLY", close: true }
      ]
    },

    at_chapel: {
      label: "03::LOCAL_CONTEXT",
      title: "SMALL SHRINE",
      copy: "Coins in a basin, a lamp that somebody refills without being asked, and a box of matches that are slightly too damp to light. It is used anyway, every night, by everyone who comes here.",
      choices: [
        { text: "LEAVE A COIN", goto: "chapel_coin" },
        { text: "WALK ON", close: true }
      ]
    },
    chapel_coin: {
      label: "03::LOCAL_CONTEXT",
      title: "ONE COIN",
      copy: "It lands with the others, none of which are collected and all of which are counted. Whatever you were thinking while you dropped it counts double, apparently, though nothing here says so.",
      choices: [
        { text: "WALK ON", close: true }
      ]
    },

    at_plaza: {
      label: "03::LOCAL_CONTEXT",
      title: "OPEN SQUARE",
      copy: "The fountain is working, which is a decision somebody made this morning. Pigeons have arranged themselves along the rim at equal intervals, as though ticketed.",
      choices: [
        { text: "CROSS IT", close: true },
        { text: "SIT BY THE WATER", goto: "plaza_sit" }
      ]
    },
    plaza_sit: {
      label: "03::LOCAL_CONTEXT",
      title: "BY THE WATER",
      copy: "Ten minutes go by at the correct speed. A busker two blocks away is practising the difficult part. The pigeons relocate precisely one metre when a pigeon walks through.",
      choices: [
        { text: "BACK TO THE STREET", close: true }
      ]
    },

    at_unknown: {
      label: "03::LOCAL_CONTEXT",
      title: "UNLISTED LINK",
      copy: "A door, a sign, an address that the map describes as probable. Whatever is behind it is maintained, and whatever is maintained here is not currently for you, which is not the same as being closed.",
      choices: [
        { text: "LEAVE IT", close: true }
      ]
    }
  },

  poiBeats: {
    PHONE: "phone_ring",
    MART: "at_mart",
    BAR: "at_bar",
    STATION: "at_station",
    TERMINAL: "at_terminal",
    PAD: "at_pad",
    VIEWPOINT: "at_viewpoint",
    ARCHIVE: "at_archive",
    CHAPEL: "at_chapel",
    PLAZA: "at_plaza"
  },

  fallback: "at_unknown",

  kindBlurb: {
    PHONE: "Public telephone, occasionally ringing",
    MART: "Corner store, open all night",
    BAR: "Drinking establishment, heavy door",
    STATION: "Elevated monorail platform",
    TERMINAL: "Ground taxi rank",
    PAD: "Sky taxi landing pad",
    VIEWPOINT: "Skyline overlook",
    ARCHIVE: "City archive and reading room",
    CHAPEL: "Small shrine, lamp lit",
    PLAZA: "Open public square"
  }
};

global.AC_STORY = AC_STORY;
})(window);
