# 100 Ideas for OnlySq CLI Improvement

### Intelligence & Context
1. **Semantic Search**: Use embeddings to search the entire codebase.
2. **Dependency Graph Awareness**: Account for imports and definitions across files.
3. **Local Models**: Support for Ollama or LM Studio for offline work.
4. **Fine-tuning**: Ability to fine-tune models on your project's specifics.
5. **Context Management**: Manually or automatically exclude unnecessary files from the context window.
6. **Log Analysis**: Automatically read terminal logs on build errors.
7. **Documentation Search**: Integration with official docs for used frameworks.
8. **Technical Debt Detection**: Highlight questionable code areas.
9. **Complexity Estimation**: Analyze cyclomatic complexity of functions.
10. **Architecture Recommendations**: Suggest SOLID/DRY improvements.

### New Agent Tools
11. **HTTP Client**: Tool for performing API requests directly from chat.
12. **SQL Tool**: View schemas and run queries against the project database.
13. **Browser Automation**: Use Playwright for agent-driven UI testing.
14. **Image-to-Code**: Convert design screenshots into HTML/CSS.
15. **Docker Manager**: Generate and run Docker containers.
16. **Kubernetes Helper**: Create and verify manifests.
17. **File System Watcher**: Agent can react to file changes in real-time.
18. **Package Search**: Search for libraries in npm/PyPI/Cargo.
19. **Regex Explainer**: Regular expression generator and explainer.
20. **Security Scanner**: Tool for finding vulnerabilities (SAST).

### User Interface (UI)
21. **Themes**: Customize chat colors.
22. **Markdown Preview**: Improved rendering of responses.
23. **Voice Input**: Control coding via voice.
24. **Drag-and-drop**: Drag files into chat to add to context.
25. **Search History**: Search through past dialogues.
26. **Bookmarks**: Save important prompts or answers.
27. **Split View**: Ability to keep chat open next to the editor.
28. **Token Visualization**: Charts for limit consumption.
29. **Progress Indicator**: Visualize what the agent is doing (planning, writing, thinking).
30. **Custom Avatars**: Customize the AI assistant's appearance.

### Git Integration
31. **Auto-Commit**: Meaningful commit message generator.
32. **PR Generator**: Generate Pull Request descriptions based on changes.
33. **Conflict Resolver**: Help in resolving complex merge conflicts.
34. **Interactive Rebase Helper**: Explanation and assistance in rebasing.
35. **Git Graph**: Visualize branches in chat.
36. **Code Review**: Automatic code review before committing.
37. **Blame Context**: Account for who and when changed the code to understand "why".
38. **Stash Manager**: Manage temporary changes through chat.
39. **Release Notes**: Generate changelogs for releases.
40. **Branch Strategy**: Tips on branch naming and flow.

### Testing & Quality
41. **Test Generator**: Create unit tests for a selected function.
42. **Mutation Testing**: Help in checking test quality.
43. **Mock Data Generator**: Create realistic data for tests.
44. **E2E Test Builder**: Assistance in writing scenarios for Cypress/Playwright.
45. **Code Coverage Helper**: Recommendations for increasing test coverage.
46. **Bug Finder**: Find logic errors without running code.
47. **TDD Mode**: Mode where the agent writes the test first, then the code.
48. **Benchmark Tool**: Measure performance of code snippets.
49. **Linter Auto-fix**: Fix all eslint/prettier errors with one button.
50. **Type Safety Generator**: Convert JS to TS.

### Frontend Specifics
51. **Tailwind Class Generator**: Pick classes by description.
52. **CSS-to-Tailwind**: Style converter.
53. **SVG Previewer**: View and edit icons in chat.
54. **Responsive Preview**: Open site preview in different resolutions.
55. **Accessibility Auditor**: Check for compliance with accessibility standards.
56. **Component Library Search**: Integration with Shadcn/UI, MUI, AntD.
57. **State Management Boilerplate**: Generate code for Redux/Zustand.
58. **Asset Optimizer**: Compress images via chat.
59. **Icon Searcher**: Search for icons in Lucide/FontAwesome.
60. **Bundle Size Analyzer**: Analyze weight of dependencies.

### Backend & Infrastructure
61. **Swagger/OpenAPI Generator**: Create API schema from code.
62. **Terraform Helper**: Write IaC code.
63. **Cron Job Builder**: Generate schedules in cron format.
64. **Environment Validator**: Check .env files for all keys.
65. **Migration Builder**: Generate migrations for TypeORM/Prisma/Alembic.
66. **Load Testing Script**: Create scripts for k6/JMeter.
67. **Cloud Cost Estimator**: Approximate calculation of cloud resource costs.
68. **Log Formatter**: Beautify unreadable logs.
69. **Serverless Configurator**: Help with AWS Lambda/Vercel Functions.
70. **CORS Debugger**: Help in configuring access policies.

### Collaboration & Learning
71. **Pair Programming Mode**: Collaborative editing mode with AI.
72. **Code Explainer for Juniors**: Simplified code explanations.
73. **Onboarding Guide**: Generate documentation for new project developers.
74. **Knowledge Base Integration**: Connect to Notion/Confluence.
75. **Slack/Discord Integration**: Send code or questions to team messenger.
76. **Quiz Generator**: Create tests based on code to check team knowledge.
77. **Library Migration Guide**: Help in moving to a new library version.
78. **Codebase Statistics**: Reports on how much code was written.
79. **Naming Assistant**: Find perfect names for variables and functions.
80. **Best Practices Wiki**: Collection of coding rules for your company within chat.

### Exotic & Future
81. **Self-healing Code**: Agent automatically fixes falling tests.
82. **Architecture Diagram**: Generate Mermaid diagrams from code.
83. **Polyglot Translator**: Translate code from one language to another (e.g., Java -> Go).
84. **Legacy Converter**: Modernize ancient code.
85. **Code Provenance**: Track if code is copied from license-dangerous places.
86. **Gamification**: Award points for clean code.
87. **Personalized Prompts**: Remember your preferences (code style, libs).
88. **Context Snapshot**: Save current desktop state as a "topic" for discussion.
89. **Multi-Agent Systems**: Run several AIs to discuss a task among themselves.
90. **Offline-first Agent**: Full operation without internet on local weights.

### Miscellaneous & Convenience
91. **Export to Markdown**: Save chat to file in one click.
92. **Keyboard Shortcuts**: Hotkeys for all frequent agent actions.
93. **Smart History Pruning**: Automatically clear history of old messages.
94. **Token Cost Warning**: Warning about too expensive requests.
95. **One-click Restore**: Undo changes made by the agent.
96. **Copy-to-Clipboard**: Improved code block copying.
97. **Sidebar/Panel Toggle**: Ability to move chat to different parts of VS Code.
98. **Model Comparison**: Compare answers from different models for one prompt.
99. **Custom Tool SDK**: Ability for users to write plugins for the agent.
100. **Easter Eggs**: Secret commands for entertainment!
