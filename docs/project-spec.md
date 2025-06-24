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
Withering: If the plant's needs (primarily water) are not met, it will begin to wither visually—leaves will droop and turn brown.
Death & Reset: Prolonged neglect will cause the plant to die. The game will then reset, allowing the user to start over with a new seed.

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

4. Environmental Factors & Events
Real-Time Seasons & Weather: The environment will reflect real-world seasons and integrate with local weather data (with user permission).
Random Events: The game will feature positive events (ladybugs, sunbeams) and dangerous events requiring user action (aphids, goats).

5. Technical Implementation Plan
Frontend Framework: We'll use React (with Vite for a fast development environment).
Rendering: The procedural plant will be rendered on an HTML5 Canvas.
State Management: The game's state will be stored in the browser's localStorage.
Deployment: The application will be configured for easy, continuous deployment via Vercel. We will use the Vercel CLI.
Debug Mode: A debug mode, activated by a URL parameter (?debug=true), will be available. This mode will accelerate time-based events (like dehydration) to facilitate testing.

6. Login
- creates a simple 3 word mnemonic for new users and asks them to copy paste it for sync across sessions and in case of browser history dumping (no email or pw required otherwise) 

- stores the mnemonic behind a settings icon (gear) for the user to copy it later

- stores the logged in session in the browser (to not force the user to use the mnemonic each time