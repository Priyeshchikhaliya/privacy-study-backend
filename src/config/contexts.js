const CONTEXTS = [
  {
    id: "smart_camera",
    title: "Smart home camera",
    shortLabel: "Smart camera",
    description:
      "Imagine this image comes from a smart home camera inside a private home (for example for security or activity detection).",
  },
  {
    id: "social_media_ai",
    title: "Social media sharing",
    shortLabel: "Social media",
    description:
      "Imagine this image is about to be shared on social media and is automatically analyzed by the platform before posting.",
  },
  {
    id: "furniture_scanner",
    title: "Room scanning / shopping app",
    shortLabel: "Room scanner",
    description:
      "Imagine this image is uploaded to a room-planning or shopping app to analyze your room and suggest furniture or layouts.",
  },
  {
    id: "ar_assistant",
    title: "AR home assistant",
    shortLabel: "AR assistant",
    description:
      "Imagine this image is analyzed by an augmented-reality assistant that helps you at home by recognizing objects or spaces.",
  },
];

const CONTEXT_IDS = CONTEXTS.map((context) => context.id);
const CONTEXT_ID_SET = new Set(CONTEXT_IDS);

module.exports = {
  CONTEXTS,
  CONTEXT_IDS,
  CONTEXT_ID_SET,
};
