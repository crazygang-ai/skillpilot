.PHONY: dev build test clean typecheck

dev:
	pnpm dev

build:
	pnpm build

build-mac:
	pnpm build:mac

test:
	pnpm test

test-e2e:
	pnpm test:e2e

typecheck:
	pnpm typecheck

clean:
	pnpm clean

install:
	pnpm install
