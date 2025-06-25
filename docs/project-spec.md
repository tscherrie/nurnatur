Game Design & Technical Specification: "Nur Natur" (v1.1)

1. Core Concept
Title: Nur Natur
Genre: Real-time plant care simulation ("Digital Tamagotchi").
Core Loop: A mindful, daily ritual of checking on a virtual tea plant, watering it, and protecting it, all presented in a soothing, artistic style.
Platform: Modern Web Application (Desktop & Mobile).
Art Style: A cohesive "sketchbook" aesthetic. All visuals, from the plant itself to the UI, will be high-quality, pencil-drawn assets. Animations will have a hand-drawn, flipbook feel.
Audio: A calming ambient soundtrack (lo-fi, nature sounds) complemented by soft, satisfying sound effects for user interactions (watering, leaf rustles, etc.).

2. The Plant & Its Lifecycle
The central element of the game is the tea plant, which exists and changes in real-time.
Environment: The plant grows directly in a patch of rich soil against a background that reflects the current season.
Optimal Growth Cycle: The ideal journey from a newly planted seed to a mature, harvestable plant is approximately 30 real-world days.
Growth Stages: The plant progresses through distinct visual phases:
Seed: The game begins with only soil. The user's first action is to plant the seed.
Sprout: The first tender shoot breaks through the soil.
Young Plant: A series of intermediate stages where the plant grows taller and develops its initial set of leaves.
Mature Plant: The plant becomes bushier, with a more complex structure and a greater number of leaves.
Flowering: Small, delicate flowers appear on the plant, signaling peak health and maturity.
Harvesting: Leaves can be plucked from the mature plant.
Neglect & Recovery:
Withering: If the plant's needs (primarily water) are not met, it will begin to wither visually. This happens sequentially, starting with the newest growth (leaves, flowers) and progressing to older parts. Individual parts will droop and turn brown.
Pruning: Watering alone will not save a withered plant. The user must actively prune the dead parts by clicking on them.
Recovery: Once all withered parts are removed and the plant is adequately watered, it will resume growth.
Death & Reset: Prolonged neglect will cause the entire plant to wither and die. The game will then reset, allowing the user to start over with a new seed.

3. Core Mechanics & Gameplay
Real-Time Persistence: The plant's state (age, hydration, health, growth progress) is saved in the browser. When the user returns, the game will calculate the changes that occurred during their absence.
Dynamic, Procedural Growth:
The plant will not be a series of static images. It will be rendered procedurally based on a set of growth parameters.
Player actions will directly influence these parameters.
Watering:
The primary interaction. The soil will visually dry out over time.
The plant's water consumption will increase as it grows larger.
Fertilization:
Users can apply different types of natural fertilizers for temporary boosts.
Harvesting & High Score:
Once the plant is mature, users can pluck individual tea leaves, tracked via a simple high score.
Pruning: When parts of the plant have withered due to lack of water, users can click on them to remove them. This is a necessary step for the plant's recovery.

4. Environmental Factors & Events
Real-Time Day/Night: The game will track real-world time to create a day/night cycle, affecting plant growth and event occurrences.
Weather Integration: The game will integrate with a public weather API to fetch local weather (based on IP or user input). Rain will fully hydrate the plant, and temperature will affect the dehydration rate.
Random Events: The game will feature positive events (ladybugs, sunbeams) and dangerous events requiring user action (aphids, goats).

5. Technical Implementation Plan
Frontend Framework: We'll use React (with Vite for a fast development environment).
Rendering: The procedural plant will be rendered on an HTML5 Canvas.
State Management: The game's state will be stored in the browser's localStorage.
Deployment: The application will be configured for easy, continuous deployment via Vercel. We will use the Vercel CLI.
Debug Mode: A debug mode, activated by a URL parameter (?debug=true), will be available. This mode will accelerate time-based events (like dehydration) to facilitate testing.