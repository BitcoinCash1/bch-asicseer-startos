ARCHES ?= x86 arm riscv

# overrides to s9pk.mk must precede the include statement
include s9pk.mk

# Clone node packages *inside* this tree. file:../foo is a symlink whose
# realpath sits outside rootDir and ncc/ts-loader then dies with TS6059.
.deps/bitcoin-cash-daemon-startos:
	git clone --depth=1 https://github.com/BitcoinCash1/bitcoin-cash-daemon-startos.git $@

.deps/bitcoin-cash-node-startos:
	git clone --depth=1 https://github.com/BitcoinCash1/bitcoin-cash-node-startos.git $@

.deps/flowee-startos:
	git clone --depth=1 https://github.com/BitcoinCash1/flowee-the-hub-startos.git $@

.deps/knuth-bch-startos:
	git clone --depth=1 https://github.com/BitcoinCash1/knuth-bch-startos.git $@

node_modules: package.json | .deps/bitcoin-cash-daemon-startos .deps/bitcoin-cash-node-startos .deps/flowee-startos .deps/knuth-bch-startos
	npm install
	@for pkg in .deps/bitcoin-cash-daemon-startos .deps/bitcoin-cash-node-startos .deps/flowee-startos .deps/knuth-bch-startos; do \
		mkdir -p "$$pkg/node_modules"; \
		ln -sfn "$(abspath node_modules)/@start9labs" "$$pkg/node_modules/@start9labs"; \
	done
