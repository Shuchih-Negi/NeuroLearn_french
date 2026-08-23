import batmanImg from "../assets/batman.png";
import jokerImg from "../assets/joker.png";
import alfredImg from "../assets/alfred.png";

export const characters = [
  { id: "batman", name: "Batman", image: batmanImg, personality: "strategic and calm" },
  { id: "joker", name: "Joker", image: jokerImg, personality: "playful and unpredictable" },
  { id: "alfred", name: "Alfred", image: alfredImg, personality: "wise and encouraging" },
];

export const chapters = [
  {
    id: "french_fundamentals",
    title: "French Fundamentals",
    description: "Master the basics of French through epic quests with your favourite character",
    topic: "French language basics",
    target_language: "fr",
    sections: [
      {
        id: "greetings_1",
        title: "Greetings-1",
        topic: "French greetings and farewells: Bonjour, Salut, Au revoir, Bonsoir, Bonne nuit",
        skill_focus: "social_phrases",
        description: "Learn how to say hello and goodbye like a true Parisian",
      },
      {
        id: "objects_1",
        title: "Objects-1",
        topic: "Common everyday objects in French: la table, la chaise, le livre, le stylo, la porte",
        skill_focus: "vocabulary_basic",
        description: "Name the objects around you in French",
      },
      {
        id: "grammar_1",
        title: "Grammar-1",
        topic: "French noun genders and articles: le, la, les, un, une, des — masculine vs feminine",
        skill_focus: "grammar_genders",
        description: "Master le and la — every French noun has a gender!",
      },
      {
        id: "greetings_2",
        title: "Greetings-2",
        topic: "French introductions and polite phrases: Je m'appelle, Comment allez-vous, Merci, S'il vous plaît, Excusez-moi",
        skill_focus: "social_phrases",
        description: "Introduce yourself and be polite in French conversations",
      },
      {
        id: "numbers_1",
        title: "Numbers-1",
        topic: "French numbers 1-20, counting, basic arithmetic in French, dates and time basics",
        skill_focus: "numbers_time",
        description: "Count from un to vingt and tell the time in French",
      },
      {
        id: "grammar_2",
        title: "Grammar-2",
        topic: "French present tense conjugation: être and avoir, regular -er verbs like parler, manger, aimer",
        skill_focus: "grammar_present",
        description: "Conjugate your first French verbs — être, avoir, and -er verbs",
      },
      {
        id: "objects_2",
        title: "Objects-2",
        topic: "French food and drink vocabulary: le pain, le fromage, l'eau, le café, les fruits, le repas",
        skill_focus: "vocabulary_basic",
        description: "Order food and drinks at a French café",
      },
      {
        id: "grammar_3",
        title: "Grammar-3",
        topic: "French adjective agreement: masculine/feminine/plural forms, adjective placement rules",
        skill_focus: "grammar_adjectives",
        description: "Make your adjectives agree — grand/grande, petit/petite",
      },
    ],
    finalBoss: {
      title: "Le Boss Final — The Ultimate French Challenge",
      description: "5 mastery questions to prove you've conquered French basics!",
      questionCount: 5,
    },
  },
];
