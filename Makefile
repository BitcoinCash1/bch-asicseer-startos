ARCHES ?= x86 arm riscv

# overrides to s9pk.mk must precede the include statement
include s9pk.mk

# Clone sibling packages needed for TypeScript resolution during npm ci
../bitcoin-cash-daemon-startos:
	git clone --depth=1 https://github.com/BitcoinCash1/bitcoin-cash-daemon-startos.git $@

../bitcoin-cash-node-startos:
	git clone --depth=1 https://github.com/BitcoinCash1/bitcoin-cash-node-startos.git $@

../flowee-startos:
	git clone --depth=1 https://github.com/BitcoinCash1/flowee-the-hub-startos.git $@

# Override s9pk.mk's node_modules recipe to also create @start9labs symlinks
# inside each cloned sibling so ncc/webpack can find @start9labs/start-sdk
# when it follows the file: symlinks to their real paths outside the project.
node_modules: package-lock.json | ../bitcoin-cash-daemon-startos ../bitcoin-cash-node-startos ../flowee-startos
	npm ci
	@for pkg in ../bitcoin-cash-daemon-startos ../bitcoin-cash-node-startos ../flowee-startos; do \
		mkdir -p "$$pkg/node_modules"; \
		ln -sfn "$(abspath node_modules)/@start9labs" "$$pkg/node_modules/@start9labs"; \
	done
