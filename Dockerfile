# Build stage

FROM ubuntu:22.04

# Libraries Setup

ENV DEBIAN_FRONTEND=noninteractive 

RUN apt-get update && apt-get -y install g++ gcc cmake automake libeigen3-dev libgmp-dev \
libboost-all-dev git curl libcurl4-openssl-dev libspdlog-dev psi4 libssl-dev nlohmann-json3-dev \
uuid-dev zlib1g-dev libpulse-dev wget

# AWS SDK Setup 

RUN git clone --recurse-submodules https://github.com/aws/aws-sdk-cpp && mkdir sdk_build && cd sdk_build && \
cmake ../aws-sdk-cpp -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH=/usr/local/ -DCMAKE_INSTALL_PREFIX=/usr/local/ -DBUILD_ONLY="s3-crt" && \
make && make install

# Libint2 setup

RUN wget https://github.com/evaleev/libint/archive/refs/tags/v2.7.1.tar.gz && \
tar -xvzf v2.7.1.tar.gz && cd libint-2.7.1 && ./autogen.sh && cd ../ && mkdir libint_build && cd libint_build && \
../libint-2.7.1/configure && make && make check && make install

# Integrals setup

RUN mkdir integrals

COPY ./submodules/integrals ./integrals

RUN cd integrals && cmake . && make

RUN mkdir ./scripts

# TODO: Move these steps to the top of the file

COPY ./scripts ./scripts

RUN apt-get -y install unzip && curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && unzip awscliv2.zip && ./aws/install

ENTRYPOINT [ "./scripts/run_integrals.sh" ]


