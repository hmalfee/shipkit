import type { PlopTypes } from '@turbo/gen';

export default function generator(plop: PlopTypes.NodePlopAPI): void {
    plop.setHelper('isApp', (type) => type === 'app');

    // create a generator
    plop.setGenerator('create', {
        description: 'Generate a new app or package',
        prompts: [
            {
                type: 'list',
                name: 'type',
                message: 'What type of workspace are you creating?',
                choices: ['package', 'app'],
            },
            {
                type: 'input',
                name: 'name',
                message: 'What is the name of the workspace?',
                validate: (input: string) => {
                    if (input.includes('.')) {
                        return 'name cannot include an extension';
                    }
                    if (input.includes(' ')) {
                        return 'name cannot include spaces';
                    }
                    if (!input) {
                        return 'name is required';
                    }
                    return true;
                },
            },
        ],
        actions: (data) => {
            const actions: PlopTypes.ActionType[] = [];

            const destination = data?.type === 'app' ? 'apps' : 'packages';

            actions.push({
                type: 'addMany',
                destination: `{{ turbo.paths.root }}/${destination}/{{ name }}`,
                templateFiles: 'templates/workspace/**',
                base: 'templates/workspace',
            });

            return actions;
        },
    });
}
