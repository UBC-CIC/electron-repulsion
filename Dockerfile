# Build stage

FROM ubuntu:22.04
# Libraries Setup
ENV DEBIAN_FRONTEND=noninteractive 
RUN apt-get update && apt-get -y install g++ gcc cmake automake libeigen3-dev libgmp-dev libboost-all-dev git curl libcurl4-openssl-dev libspdlog-dev psi4 libssl-dev nlohmann-json3-dev uuid-dev zlib1g-dev libpulse-dev
# AWS SDK Setup
RUN git clone --recurse-submodules https://github.com/aws/aws-sdk-cpp && mkdir sdk_build && cd sdk_build && cmake ../aws-sdk-cpp -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH=/usr/local/ -DCMAKE_INSTALL_PREFIX=/usr/local/ -DBUILD_ONLY="s3-crt" && make && make install
RUN mkdir integrals
COPY ./submodules/integrals ./integrals


