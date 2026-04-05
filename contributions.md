# Contributions

Every member has to complete at least 2 meaningful tasks per week, where a
single development task should have a granularity of 0.5-1 day. The completed
tasks have to be shown in the weekly TA meetings. You have one "Joker" to miss
one weekly TA meeting and another "Joker" to once skip continuous progress over
the remaining weeks of the course. Please note that you cannot make up for
"missed" continuous progress, but you can "work ahead" by completing twice the
amount of work in one week to skip progress on a subsequent week without using
your "Joker". Please communicate your planning **ahead of time**.

Note: If a team member fails to show continuous progress after using their
Joker, they will individually fail the overall course (unless there is a valid
reason).

**You MUST**:

- Have two meaningful contributions per week.

**You CAN**:

- Have more than one commit per contribution.
- Have more than two contributions per week.
- Link issues to contributions descriptions for better traceability.

**You CANNOT**:

- Link the same commit more than once.
- Use a commit authored by another GitHub user.

---

## Contributions Week 1 - [23.03.2026] to [29.03.2026]

| **Student**        | **Date**  | **Link to Commit** | **Description**                 | **Relevance**                       |
| ------------------ | --------  | ------------------ | ------------------------------- | ----------------------------------- |
| **@janagraf**   | 24.03.2026| https://github.com/liun777/sopra-fs26-group-26-server/commit/da73105c2e1d3591dd554c3d26adef0a0bdac17c | Setup WebSocket configuration with STOMP for real-time lobby updates | Enables the server to push live lobby state changes to all connected clients without polling |
|                    | 24.03.2026| https://github.com/liun777/sopra-fs26-group-26-server/commit/bb131f99c674536cdfde05803c2bb31177cec647 | Implement unique lobby session IDs and token-based lobby authentication | Allows players to create and join lobbies securely using unique session codes and user tokens |
|                    | 24.03.2026    | https://github.com/liun777/sopra-fs26-group-26-server/commit/240c03448b7105ffb3afb1f0c85785b84c9003ab | Add WebSocket lobby state controller to handle client state requests | Allows clients to request the current lobby state on reconnect, completing the real-time lobby update flow |
| **[@aleexgort]** | 23.03.2026    | (https://github.com/liun777/sopra-fs26-group-26-server/commit/ec25402a37f4e91a89f8fbc2d2299c8af78d3b67) | Server: Set up user registration, login and authentication (frontend + backend) #15. Added cabo-themed styling and background across all pages #15 | Allows the others to build upon the inital setup, sets a template for the frontend for the design. |
| **[@aleexgort]** | 23.03.2026    | https://github.com/liun777/sopra-fs26-group-26-client/commit/c49a5628486f3fd978ca63ba980f41c09f02cd13 | Client: Set up user registration, login and authentication (frontend + backend) #15. Added cabo-themed styling and background across all pages #15 | Allows the others to build upon the inital setup, sets a template for the frontend for the design. |
| **@uIiana** | 29.03.2026   | https://github.com/liun777/sopra-fs26-group-26-server/commit/9fd8377eebc884bb4c3321a5b9a1460c88e2f16a <br><br> https://github.com/liun777/sopra-fs26-group-26-client/commit/eab8ad1a6eb10708c65d654de920a2519b0b7cff <br><br> https://github.com/liun777/sopra-fs26-group-26-client/commit/1f071707459b00827714b1a32adb1283beec1f58 <br><br> https://github.com/liun777/sopra-fs26-group-26-server/commit/9eb9d8c8e041d7454d8ae353389fb67328a0174b | - Added functionality to send/receive invites (backend and frontend) and to create/join waiting lobbies (mostly frontend, some backend). Closes [#3](https://github.com/liun777/sopra-fs26-group-26-client/issues/3) <br> - Implemented a frontend toggle on the create_lobby page for clean differentiation between creation of public and private lobbies <br> - Implemented a polling fallback for failing websocket traffic at the google cloud app engine (needed for seamless invite/lobby functionality without page refreshes) <br> - More stable google cloud deployment config for H2 usage (single instance) | - Implements some of the core functionality of the platform (invites/lobbies) <br> - Addresses some problems of the tech stack / architectural approach (google cloud app engine, websockets vs polling) |
| **@uIiana** | 29.03.2026    | https://github.com/liun777/sopra-fs26-group-26-server/commit/a056f78cf8cac87db26815ded72278e4270d786d | Additional backend functionality for lobby privacy and access control, closes [#36](https://github.com/liun777/sopra-fs26-group-26-server/issues/36) <br> - PATCH /lobbies/{sessionId}/settings with representation in LobbySettingsPatchDTO and core logic in LobbyService.updateLobbySettings <br> - added isPublic to WaitingLobbyViewDTO <br><br> Basic functionality for access control (lobby members only visible to those who have joined it) was also implemented in the scope of the previous contribution <br><br> Wrote numerous tests for both contributions | Lays ground for frontend implementation of more advanced private/public lobby functionality. Tests implemented functionality |
| **@liun777** | 26.03.2026    | (https://github.com/liun777/sopra-fs26-group-26-server/commit/0c1431960b46ff667e80a5ebf68efde334a8ea53) | Add fundamental structure that  allows to start a game: Is based on multiple modules like a class for the game and the cards, as well as game-service, -controller and  -repository. Should allow to include the external API in the card class later. Respects the specifications of the REST interface from report 2. | Gives a base on which the logic of the game can be built.  |
|  | 28.03.2026    | (https://github.com/liun777/sopra-fs26-group-26-server/commit/f7d77bc167cce83e547e46e331f66d081a2c27fe) | There were some deployment problems with github actions. Errors  were resolved and code adjusted. | Makes sure that the automatic deployment pipeline works. |
|                    | 28.03.2026    | (https://github.com/liun777/sopra-fs26-group-26-server/commit/08c04316d858d925fe8e84a6adde5072df40e8c2) | Same as above. | Same as above. |
|| 29.03.2026 | (https://github.com/liun777/sopra-fs26-group-26-server/commit/31c0814590314361593aa49e04821f8bba570d04) | Added functionality to the login and logout methods in UserService. Makes sure user status and token are handled reasonably. Might want to extend this using web sockets. | Allows the user attributes to be handled correctly. Ensures that tokens cannot be misused when user is logged out. |

---

## Contributions Week 2 - [30.03.2026] to [05.04.2026]

| **Student**        | **Date** | **Link to Commit** | **Description**                 | **Relevance**                       |
| ------------------ | -------- | ------------------ | ------------------------------- | ----------------------------------- |
| **[@aleexgort]** | [03.04.2026]   | [https://github.com/liun777/sopra-fs26-group-26-server/commit/27bd126c78cccc1be7495923cc5cb2dc2a457e8c] | [Implement logic to always render the DiscardPile top card with its face-up value.#9] | [Backend: -getDiscardPileTopCard() implemented, -GET /games/{gameId}/discard-pile/top Endpoint implemented ] |
| **[@aleexgort]** | [03.04.2026]   | [https://github.com/liun777/sopra-fs26-group-26-client/commit/9d4914928bd1ce8b88c97716bc053918d9094444] | [Implement logic to always render the DiscardPile top card with its face-up value.#9] | [Frontend: -get the top card form the backend, - show a "?" if its empty, -show the value when we have a specific card] |
| **[@aleexgort]** | [03.04.2026]   | [https://github.com/liun777/sopra-fs26-group-26-client/commit/f3534f2686972262027dccd5be632ed492a7c6f3] | [ # 8: Implement a global isMyTurn state that disables all buttons and click listeners on the game board when false.] | [Frontend: -implemented the backend logic in the frontend, such that certain buttons are only clickable when it is the specific users turn ] |
| **[@aleexgort]** | [03.04.2026]   | [https://github.com/liun777/sopra-fs26-group-26-server/commit/8afd8cfe507b6d8e8c04f86d1f6f0714812b57d3] | [# 8: Implement a global isMyTurn state that disables all buttons and click listeners on the game board when false.] | [Backend: -Adds discard pile top card logic (always visible and up-to-date), - Introduces turn-based interaction control via isMyTurn state] |
| **[@aleexgort]** | [04.04.2026]   | [first link: https://github.com/liun777/sopra-fs26-group-26-client/commit/bc0c5d631c003b422f521f81a1e8127180fb86e2, second link: https://github.com/liun777/sopra-fs26-group-26-client/commit/10e56da1b1d0ac58e604427cd3588b015009c697] | [# 13: Error Notification System: Create "Toast" or "Alert" components to display "Lobby full" or "Lobby not found" based on the backend error codes.] | [only Frontend: -created a whole new page for the lobby join with logic and style, -implemented an the error notification system (first link) -fixed some bugs that i introducted for the npm build (second link)] |
| **@uIiana** | 04.04.2026   | https://github.com/liun777/sopra-fs26-group-26-server/commit/62a488a41f446e791c060c5acfc452a6c83cb8d2 | Implemented the GameMoveAuthorizationInterceptor that ensures that a move is executed by the current player (returns 403 Forbidden otherwise). The interceptor matches endpoint uri based on the following schema: /games/\*/moves/\*. Wrote 3 tests for new functionality. Closes [#30](https://github.com/liun777/sopra-fs26-group-26-server/issues/30) | A reusable solution for all moves whose endpoints follow the /games/\*/moves/\* schema. Implements some of the core logic. |
| **@uIiana** | 05.04.2026   | https://github.com/liun777/sopra-fs26-group-26-server/commit/51c4d37646b8afc3629c382160f4590299306de0 | Implemented a per player game state broadcast - every player receives their own version of the game state representation (relevant for card visibility). The per player messages are sent via personal WebSocket queues. The StompAuthChannelInterceptor class authenticates every incoming client message of type CONNECT to keep track of client identities. Implemented relevant DTOs. GameStateBroadcastMapper builds filtered representations per player based on the DTOs. Consolidated game persistence and game state broadcast in one method saveGameAndBroadcast. Implemented 2 tests. Closes [#27](https://github.com/liun777/sopra-fs26-group-26-server/issues/27) | Implements the core logic of per player game state broadcast. Serves as a reusable foundation for later move based game state mutations. Provides per player differentiated data to the frontend. |
| **@uIiana** | 05.04.2026   | https://github.com/liun777/sopra-fs26-group-26-server/commit/53f436b029c33f71c22f63c2969e886634762569 | The core logic for the task [#41](https://github.com/liun777/sopra-fs26-group-26-server/issues/41) was already implemented, but tests for it were not written. I wrote 4 tests for it: 2 for LobbyController (verifying API behavior) and 2 for LobbyService (verifying business logic). Closes [#41](https://github.com/liun777/sopra-fs26-group-26-server/issues/41) | Validates correct behavior of lobby joining through testing. |
| **@liun777** | 04.04.2026   | https://github.com/liun777/sopra-fs26-group-26-server/commit/1438d2ba331fbaa370e9ae841d9ef47a7ec48ef4 | The cards are implemented using the DeckOfCardsAPI and the logic to handle shuffling and dealing the first four cards is added. This makes use of a card entity and the corresponding DTOs as well as the game entity plus its service and controller. | This includes the external API (DeckOfCardsAPI) into our project. |
| **@liun777** | 05.04.2026   | https://github.com/liun777/sopra-fs26-group-26-server/commit/deb441ccdad8107fd983c12b3578c38305027557 | The endpoint and the corresponding logic in the service was already implemented so a LobbyDTO was added and the backend responses accordingly adjusted. | This helps to give uniform responses from the backend and controll which fields should be revealed to the frontend. |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |
| **[@githubUser4]** | [date]   | [Link to Commit 1] | [Brief description of the task] | [Why this contribution is relevant] |
|                    | [date]   | [Link to Commit 2] | [Brief description of the task] | [Why this contribution is relevant] |

---

## Contributions Week 3 - [Begin Date] to [End Date]

_Continue with the same table format as above._

---

## Contributions Week 4 - [Begin Date] to [End Date]

_Continue with the same table format as above._

---

## Contributions Week 5 - [Begin Date] to [End Date]

_Continue with the same table format as above._

---

## Contributions Week 6 - [Begin Date] to [End Date]

_Continue with the same table format as above._
