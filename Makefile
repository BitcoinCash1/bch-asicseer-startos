ARCHES ?= x86 arm riscv

../bitcoin-cash-daemon-startos:
	git clone --depth=1 https://github.com/BitcoinCash1/bitcoin-cash-daemon-startos.git $@

../bitcoin-cash-node-startos:
	git clone --depth=1 https://github.com/BitcoinCash1/bitcoin-cash-node-startos.git $@

../flowee-startos:
	git clone --depth=1 https://github.com/BitcoinCash1/flowee-the-hub-startos.git $@

node_modules: | ../bitcoin-cash-daemon-startos ../bitcoin-cash-node-startos ../flowee-startos

include s9pk.mk
