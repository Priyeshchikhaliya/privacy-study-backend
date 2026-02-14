const CONTEXTS = [
  {
    id: "ar_assistant",
    title: "AR home assistant",
    shortLabel: "the AR home assistant",
    description:
      "Imagine using an app like IKEA Place or Amazon's AR that lets you visualize furniture in your room using your phone camera to scan your space.",
  },
  {
    id: "furniture_scanner",
    title: "Room scanning & shopping app",
    shortLabel: "the room scanning app",
    description:
      "Imagine using an app like Houzz or Home Depot that scans your room photos to suggest products, measure spaces, or provide home improvement ideas.",
  },
  {
    id: "smart_camera",
    title: "Smart home security camera",
    shortLabel: "the smart home camera",
    description:
      "Imagine this image was captured by a home security camera like Ring or Nest that records inside your home and uses AI to detect people or activity.",
  },
  {
    id: "social_media_ai",
    title: "Social media photo sharing",
    shortLabel: "social media",
    description:
      "Imagine uploading this to Instagram, Facebook, or Google Photos where AI automatically analyzes it to tag people, identify objects, and organize your content.",
  },
];

const CONTEXT_IDS = CONTEXTS.map((context) => context.id);
const CONTEXT_ID_SET = new Set(CONTEXT_IDS);

module.exports = {
  CONTEXTS,
  CONTEXT_IDS,
  CONTEXT_ID_SET,
};
