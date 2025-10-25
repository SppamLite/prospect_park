# Documentation

This directory contains detailed guides and documentation for Prospect Park.

## Available Guides

### [Multi-Instance Setup](multi-instance-setup.md)
Learn how to run multiple Prospect Park instances simultaneously with different configurations, ports, and databases. Perfect for testing multiple scenarios at once.

**Topics covered:**
- Running 2-3 instances with docker-compose
- Different ports and credentials per instance
- Query delay configuration
- Testing with TablePlus and psql
- Troubleshooting multi-instance setups

### [Docker Hub Publishing](docker-hub-publishing.md)
Complete guide for publishing and updating the Prospect Park Docker image on Docker Hub.

**Topics covered:**
- Logging in to Docker Hub
- Building and tagging images
- Pushing to Docker Hub
- Version management
- Updating the image
- Automation with GitHub Actions

### [Project Structure](project-structure.md)
Architecture overview and module organization of the Prospect Park codebase.

**Topics covered:**
- Directory layout
- Module responsibilities
- Design principles
- Adding new features
- Development guidelines

---

## Quick Links

- [Main README](../README.md) - Start here for basic usage
- [CLAUDE.md](../CLAUDE.md) - Developer and LLM instructions
- [Docker Hub Repository](https://hub.docker.com/r/sppamlitte/prospect-park) - Published image

## Contributing

When adding new documentation:
1. Create a new markdown file in this directory
2. Use lowercase with hyphens (e.g., `my-new-guide.md`)
3. Add a link to this README
4. Reference it from the main README if it's user-facing
