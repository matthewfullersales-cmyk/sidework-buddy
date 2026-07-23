// Server-only quiz answer bank. This file is never bundled to the client
// (filename ends in `.server.ts`), so correct answers for built-in training
// modules NEVER ship to browsers. Menu-quiz answers live in the
// `menu_quiz_banks` table (per restaurant).

export type TrainingCategory = "Server" | "Bartender" | "Host" | "Kitchen";

export interface BankQuestion {
  question: string;
  options: string[];
  answerIndex: number;
}

export const QUIZ_POOLS: Record<TrainingCategory, BankQuestion[]> = {
  Server: [
    { question: "When should you greet a guest after they're seated?", options: ["Within 5 minutes", "Within 2 minutes & offer water", "When you have time", "Only if they wave"], answerIndex: 1 },
    { question: "How should allergies be handled?", options: ["Ignore them", "Note & alert kitchen immediately", "Tell guest to be careful", "Guess what's safe"], answerIndex: 1 },
    { question: "A guest is unhappy with their dish. What do you do first?", options: ["Argue politely", "Listen, apologize, then offer a fix", "Comp the meal silently", "Ignore it"], answerIndex: 1 },
    { question: "How often should you check back after entrées drop?", options: ["Never", "Within 2 bites", "After 15 minutes", "Only when called"], answerIndex: 1 },
    { question: "Best way to deliver a check?", options: ["Toss on table", "Wait until asked, then promptly", "Drop with appetizers", "Hand directly to host"], answerIndex: 1 },
    { question: "When clearing plates, you should…", options: ["Stack loudly at table", "Clear quietly from the right when all are done", "Leave them all night", "Ask guests to help"], answerIndex: 1 },
    { question: "Best way to upsell wine?", options: ["Push the most expensive", "Pair to the dish they ordered", "Ignore wine list", "Suggest random"], answerIndex: 1 },
    { question: "If you don't know an ingredient, you should:", options: ["Make it up", "Check with the kitchen", "Skip the question", "Say it's a secret"], answerIndex: 1 },
    { question: "When describing a dish, focus on:", options: ["Calories", "Ingredients, preparation, and flavor", "Pricing", "Allergens only"], answerIndex: 1 },
    { question: "Modifiers must be entered…", options: ["After food delivered", "Before sending the ticket", "Only if reminded", "Never"], answerIndex: 1 },
  ],
  Bartender: [
    { question: "When must you ID a guest?", options: ["Never", "After 10pm only", "Anyone appearing under 30", "Weekends only"], answerIndex: 2 },
    { question: "Visibly intoxicated guest orders another drink. You:", options: ["Serve", "Politely refuse, offer water/food", "Charge double", "Ask coworker to serve"], answerIndex: 1 },
    { question: "Signs of intoxication include:", options: ["Quietness", "Slurred speech, unsteady balance", "Ordering food", "Asking for the check"], answerIndex: 1 },
    { question: "Standard single pour is:", options: ["0.5 oz", "1.5 oz", "3 oz", "Whatever feels right"], answerIndex: 1 },
    { question: "Why use a jigger?", options: ["Tradition", "Consistency and cost control", "Looks cool", "It's faster"], answerIndex: 1 },
    { question: "Fresh citrus should be juiced:", options: ["Weekly", "Daily", "Monthly", "Pre-bottled is fine"], answerIndex: 1 },
    { question: "Red wine is typically served at:", options: ["32°F", "55–65°F", "85°F", "Boiling"], answerIndex: 1 },
    { question: "Best draft beer pour leaves:", options: ["No head", "About 1-inch head", "All foam", "Half foam"], answerIndex: 1 },
    { question: "FIFO inventory applies to:", options: ["Only food", "Beer kegs and wine inventory too", "Nothing", "Just wine"], answerIndex: 1 },
  ],
  Host: [
    { question: "Greet every guest within:", options: ["30 seconds", "2 minutes", "5 minutes", "When you have time"], answerIndex: 0 },
    { question: "When the wait is 45+ minutes you should:", options: ["Hide the truth", "Quote accurately & offer alternatives", "Tell them to leave", "Quote 10 min"], answerIndex: 1 },
    { question: "Rotating sections helps:", options: ["Confuse staff", "Balance server workload & tips", "Slow service", "Annoy guests"], answerIndex: 1 },
    { question: "When seating a guest with accessibility needs:", options: ["Far booth", "Ask their preference, accommodate", "Closest table only", "Skip them"], answerIndex: 1 },
    { question: "If you mis-seat into a closed section:", options: ["Leave them", "Apologize, move them, notify server", "Argue", "Ignore"], answerIndex: 1 },
    { question: "A reservation no-shows after 15 minutes — best move:", options: ["Hold forever", "Release the table & note the no-show", "Charge them", "Re-book immediately"], answerIndex: 1 },
    { question: "Phone reservation best practice:", options: ["Rush the call", "Confirm name, party, time, contact, special needs", "Take only the name", "Refuse phone bookings"], answerIndex: 1 },
  ],
  Kitchen: [
    { question: "Safe internal temp for chicken (°F):", options: ["120", "145", "165", "200"], answerIndex: 2 },
    { question: "Cutting board color for raw poultry:", options: ["Green", "Red", "Yellow", "Blue"], answerIndex: 2 },
    { question: "Hands must be washed:", options: ["Once a shift", "Between tasks and after contamination", "Only after bathroom", "When dirty visibly"], answerIndex: 1 },
    { question: "Danger zone temperature range (°F):", options: ["0–32", "41–135", "150–200", "200+"], answerIndex: 1 },
    { question: "Raw meat in the walk-in should be stored:", options: ["On top shelf", "Below ready-to-eat foods", "Anywhere", "Next to dairy"], answerIndex: 1 },
    { question: "Mise en place means:", options: ["Cleaning at close", "Everything in its place before service", "A French sauce", "A knife type"], answerIndex: 1 },
    { question: "If you 86 an item, you should:", options: ["Keep selling it", "Notify FOH immediately", "Wait an hour", "Tell only one server"], answerIndex: 1 },
    { question: "Walk-in temperature should be at or below:", options: ["50°F", "41°F", "60°F", "32°F"], answerIndex: 1 },
    { question: "Sanitizer bucket should be changed:", options: ["Weekly", "Every 2–4 hours", "Once a month", "Never"], answerIndex: 1 },
    { question: "Hot oil disposal:", options: ["Down drain", "Cool, then to designated grease bin", "Trash bag hot", "Leave in fryer indefinitely"], answerIndex: 1 },
  ],
};

// Map every built-in video id to its category pool. Menu quiz is handled
// separately (per-owner bank in menu_quiz_banks).
export const VIDEO_CATEGORY: Record<string, TrainingCategory> = {
  // Layer 1 general
  "general-foh": "Server",
  "general-boh": "Kitchen",
  // Host
  "host-greet-seat": "Host",
  "host-reservations": "Host",
  "host-waitlist-recovery": "Host",
  // Server
  "server-wine-service": "Server",
  "server-table-presentation": "Server",
  "server-allergens-mods": "Server",
  // Busser / SA
  "support-table-reset": "Server",
  "support-service-flow": "Server",
  // Bartender
  "bar-cocktail-standards": "Bartender",
  "bar-responsible-service": "Bartender",
  "bar-wine-beer": "Bartender",
  // Bar Back
  "barback-setup": "Bartender",
  "barback-support": "Bartender",
  // Chef
  "chef-leadership": "Kitchen",
  "chef-menu-development": "Kitchen",
  "chef-food-safety": "Kitchen",
  // Line
  "line-ticket-rail": "Kitchen",
  "line-station-setup": "Kitchen",
  "line-allergens": "Kitchen",
  // Others
  "garde-cold-station": "Kitchen",
  "pizza-production": "Kitchen",
  "prep-knife-skills": "Kitchen",
  "dish-sanitation": "Kitchen",
  // Manager
  "mgr-leadership": "Server",
  "mgr-scheduling-ops": "Server",
  "mgr-guest-recovery": "Server",
};

