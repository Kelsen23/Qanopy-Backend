# Contributing to Qanopy-Backend

Thanks for your interest in contributing. We are excited to build **Qanopy** together.
This document outlines how to get started, the contribution workflow, and some guidelines to keep things consistent.

---

## Getting Started

1. **Fork the repository** and clone your fork:

   ```bash
   git clone https://github.com/Kelsen23/Qanopy-Backend.git
   cd Qanopy-Backend
   ```

1. Install dependencies:

   ```bash
   npm install
   ```

1. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Fill in the required values.

1. Run the project locally:

   ```bash
   npm run dev
   ```

## Contribution Workflow

1. Pick an issue:
   - Check the Issues tab.
   - Look for issues labeled good first issue or those assigned to a milestone.

1. Create a branch:

   Use the following naming convention:

   ```bash
   feat/short-description
   bugfix/short-description
   chore/short-description
   ```

   Example:

   ```bash
   git checkout -b feat/user-auth
   ```

1. Make your changes and commit using Conventional Commits:

   ```bash
   feat(auth): add JWT login
   fix(api): correct status code for errors
   chore: update dependencies
   ```

1. Push your branch:

   ```bash
   git push origin feat/user-auth
   ```

1. Open a Pull Request (PR):
   - Provide a clear description of the change.
   - Reference related issues using Closes #ISSUE_NUMBER.

## Code Guidelines

- Follow existing coding style & linting rules.
- Keep commits small and focused.
- Add tests for new features or bug fixes.
- Update documentation if needed.

## Questions

If you have any questions:

- Open a Discussion
- Or ask in the issue you're working on.
