from distutils.core import setup

setup(
    name='cli',
    version='0.1',
    packages=['cli'],
    install_requires=[
        'click',
        'boto3',
        'botocore',
        'uuid',
    ],
    extras_require={
        'dev': [
            'flake8',
            'isort',
            'mypy',
            'pytest',
            'boto3-stubs[essential,stepfunctions,ecs,sts]'
        ],
    }
)
