import { awscdk, github, JsonFile, Project, typescript } from "projen";
import { JobStepOutput } from "projen/lib/github/workflows-model";
import { TypeScriptAppProject } from "projen/lib/typescript";

const projectMetadata = {
  author: "Ajitha",
  authorAddress: "",
  repositoryUrl: "https://github.com/ajestharl/test-repo-npm.git",
  cdkVersion: "2.189.1",
  constructsVersion: "10.4.2",
  defaultReleaseBranch: "main",
  name: "ajithaproject",
};

const NODE_VERSION = ">18.0.0";
export const configureMarkDownLinting = (tsProject: TypeScriptAppProject) => {
  tsProject.addDevDeps(
    "eslint-plugin-md",
    "markdown-eslint-parser",
    "eslint-plugin-prettier",
  );
  tsProject.eslint?.addExtends(
    "plugin:md/recommended",
    "plugin:prettier/recommended",
  );
  tsProject.eslint?.addOverride({
    files: ["*.md"],
    parser: "markdown-eslint-parser",
    rules: {
      "prettier/prettier": ["error", { parser: "markdown" }],
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/return-await": "off",
      quotes: "off",
    },
  });
  tsProject.eslint?.addRules({
    "prettier/prettier": "error",
    "md/remark": [
      "error",
      {
        plugins: [
          "preset-lint-markdown-style-guide",
          ["lint-list-item-indent", "space"],
        ],
      },
    ],
  });
};

export const addTestTargets = (subProject: Project) => {
  const eslintTask = subProject.tasks.tryFind("eslint");
  const testTask = subProject.tasks.tryFind("test");
  if (testTask && eslintTask) {
    testTask.reset();
    testTask.exec(
      "jest --passWithNoTests --updateSnapshot --testPathIgnorePatterns=.*\\.accept\\.test\\.ts$",
      {
        receiveArgs: true,
      },
    );
    testTask.spawn(eslintTask);
  }

  const acceptTask = subProject.addTask("accept", {
    description: "Run all acceptance tests",
  });
  const defaultTask = subProject.tasks.tryFind("default");
  if (defaultTask) acceptTask.spawn(defaultTask);

  const preCompileTask = subProject.tasks.tryFind("pre-compile");
  if (preCompileTask) acceptTask.spawn(preCompileTask);

  const compileTask = subProject.tasks.tryFind("compile");
  if (compileTask) acceptTask.spawn(compileTask);

  const postCompileTask = subProject.tasks.tryFind("post-compile");
  if (postCompileTask) acceptTask.spawn(postCompileTask);

  acceptTask.exec("jest --passWithNoTests --updateSnapshot --group=accept", {
    receiveArgs: true,
  });
};
const project = new awscdk.AwsCdkConstructLibrary({
  ...projectMetadata,
  jsiiVersion: "~5.7.0",
  projenrcTs: true,
  docgen: true,
  github: true,
  gitignore: [".idea", "API.md"],
  eslint: true,
  eslintOptions: {
    prettier: true,
    fileExtensions: [".ts", ".md"],
    dirs: ["src", "test", "docs"],
  },
  jestOptions: {
    jestConfig: {
      verbose: true,
    },
  },
  cdkVersionPinning: false,
  release: true,
  autoMerge: false,
  releaseToNpm: false,
  constructsVersion: "10.4.2",
  packageName: "@example/test-repo-npm",
  description: "Test Package",
  // deps: [],                /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],             /* Build dependencies for this module. */
  // packageName: undefined,  /* The "name" in package.json. */
});
if (project.github) {
  const buildWorkflow = project.github?.tryFindWorkflow("build");
  if (buildWorkflow && buildWorkflow.file) {
    buildWorkflow.file.addOverride("jobs.build.permissions.contents", "read");
    buildWorkflow.file.addOverride("jobs.build.env", {
      CI: "true",
      // Increasing heap size to mitigate potential "heap out of memory" errors during ESLint execution.
      // TODO: Need to find a better way to do this, but this works for now.
      NODE_OPTIONS: "--max-old-space-size=8192",
    });
  }
}
// Add Lerna configuration file (lerna.json)
new JsonFile(project, "lerna.json", {
  obj: {
    packages: ["src/packages/*", "src/packages/smithy/build/smithy/source/*"],
    version: "independent",
    npmClient: "yarn",
  },
});
project.package.file.addOverride("private", true);
project.package.file.addOverride("workspaces", [
  "src/packages/*",
  "src/packages/smithy/build/smithy/source/*",
]);
// Run Lerna build one package at a time and,
// waits for each package to complete before showing its logs.
project.preCompileTask.exec("npx lerna run build --concurrency=1 --no-stream");
project.addScripts({
  "import-private-key":
    "ts-node src/packages/app-framework-ops-tools/src/importPrivateKey.ts",
  "get-table-name":
    "ts-node src/packages/app-framework-ops-tools/src/getTableName.ts",
});

addTestTargets(project);
configureMarkDownLinting(project);

interface PackageConfig {
  name: string;
  outdir: string;
  deps?: string[];
  devDeps?: string[];
  bundledDeps?: string[];
}
const addPrettierConfig = (projectType: Project) => {
  new JsonFile(projectType, ".prettierrc.json", {
    obj: {
      singleQuote: true,
      trailingComma: "all",
    },
  });
};

export const createPackage = (config: PackageConfig) => {
  const tsProject = new awscdk.AwsCdkConstructLibrary({
    ...projectMetadata,
    name: config.name,
    outdir: config.outdir,
    parent: project,
    deps: config.deps,
    devDeps: config.devDeps,
    bundledDeps: config.bundledDeps,
    docgen: false,
    packageName: config.name,
    release: true,
    releaseToNpm: true,
  });
  addTestTargets(tsProject);
  addPrettierConfig(tsProject);
  configureMarkDownLinting(tsProject);
  tsProject.addFields({
    engines: {
      node: NODE_VERSION,
    },
  });
  tsProject.package.file.addOverride("private", false);
  return tsProject;
};

createPackage({
  name: "ajithapack1",
  outdir: "src/packages/ajithapack1",
});

const package2 = new typescript.TypeScriptProject({
  ...projectMetadata,
  name: "ajithapack2",
  outdir: "src/packages/ajithapack2",
  parent: project,
  projenrcTs: false,
  release: true,
  releaseToNpm: true,
  repository: projectMetadata.repositoryUrl,
  deps: [
    "@aws-sdk/client-resource-groups-tagging-api",
    "@aws-sdk/client-kms",
    "@aws-sdk/client-dynamodb",
    "commander@^11.0.0",
  ],
  devDeps: [
    "aws-sdk-client-mock",
    "mock-fs",
    "@types/mock-fs",
    "jest-runner-groups",
  ],
  jestOptions: {
    jestConfig: {
      runner: "groups",
      verbose: true,
    },
  },
});
addTestTargets(package2);
addPrettierConfig(package2);
configureMarkDownLinting(package2);
package2.addFields({
  engines: {
    node: NODE_VERSION,
  },
});
package2.package.file.addOverride("private", false);
const workflow = project.github?.addWorkflow("release_client");
if (workflow) {
  workflow.on({
    push: { branches: ["main"] },
    workflowDispatch: {},
  });

  workflow.addJobs({
    release: {
      runsOn: ["ubuntu-latest"],
      permissions: { contents: github.workflows.JobPermission.WRITE },
      outputs: {
        latest_commit: {
          stepId: "git_remote",
          outputName: "latest_commit",
        } as JobStepOutput,
        tag_exists: {
          stepId: "check_tag_exists",
          outputName: "exists",
        } as JobStepOutput,
      },
      env: {
        CI: "true",
      },
      defaults: {
        run: {
          workingDirectory:
            "./src/packages/smithy/build/smithy/source/typescript-client-codegen",
        },
      },
      steps: [
        {
          name: "Checkout",
          uses: "actions/checkout@v4",
          with: { "fetch-depth": 0 },
        },
        {
          name: "Set git identity",
          run: [
            'git config user.name "github-actions"',
            'git config user.email "github-actions@github.com"',
          ].join("\n"),
        },
        {
          name: "Setup Node.js",
          uses: "actions/setup-node@v4",
          with: { "node-version": "lts/*" },
        },
        {
          name: "Install dependencies",
          run: "yarn install --check-files --frozen-lockfile",
          workingDirectory: "./",
        },
        {
          name: "release",
          run: "npx projen release",
        },
        {
          name: "Check if version has already been tagged",
          id: "check_tag_exists",
          run: [
            "TAG=$(cat dist/releasetag.txt)",
            '([ ! -z "$TAG" ] && git ls-remote -q --exit-code --tags origin $TAG && (echo "exists=true" >> $GITHUB_OUTPUT)) || (echo "exists=false" >> $GITHUB_OUTPUT)',
            "cat $GITHUB_OUTPUT",
          ].join("\n"),
        },
        {
          name: "Check for new commits",
          id: "git_remote",
          run: [
            'echo "latest_commit=$(git ls-remote origin -h ${{ github.ref }} | cut -f1)" >> $GITHUB_OUTPUT',
            "cat $GITHUB_OUTPUT",
          ].join("\n"),
        },
        {
          name: "Backup artifact permissions",
          if: "${{ steps.git_remote.outputs.latest_commit == github.sha }}",
          run: "cd dist && getfacl -R . > permissions-backup.acl",
          continueOnError: true,
        },
        {
          name: "Upload artifact",
          if: "${{ steps.git_remote.outputs.latest_commit == github.sha }}",
          uses: "actions/upload-artifact@v4.4.0",
          with: {
            name: "build-artifact",
            path: "./src/packages/smithy/build/smithy/source/typescript-client-codegen/dist",
            overwrite: true,
          },
        },
      ],
    },
    release_github: {
      name: "Publish to GitHub Releases",
      needs: ["release", "release_npm"],
      runsOn: ["ubuntu-latest"],
      permissions: { contents: github.workflows.JobPermission.WRITE },
      if: "needs.release.outputs.tag_exists != 'true' && needs.release.outputs.latest_commit == github.sha",
      steps: [
        {
          uses: "actions/setup-node@v4",
          with: { "node-version": "lts/*" },
        },
        {
          name: "Download build artifacts",
          uses: "actions/download-artifact@v4",
          with: {
            name: "build-artifact",
            path: "dist",
          },
        },
        {
          name: "Restore build artifact permissions",
          run: "cd dist && setfacl --restore=permissions-backup.acl",
          continueOnError: true,
        },
        {
          name: "Release",
          env: {
            GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
          },
          run: 'errout=$(mktemp); gh release create $(cat dist/releasetag.txt) -R $GITHUB_REPOSITORY -F dist/changelog.md -t $(cat dist/releasetag.txt) --target $GITHUB_SHA 2> $errout && true; exitcode=$?; if [ $exitcode -ne 0 ] && ! grep -q "Release.tag_name already exists" $errout; then cat $errout; exit $exitcode; fi',
        },
      ],
    },
    release_npm: {
      name: "Publish to npm",
      needs: ["release"],
      runsOn: ["ubuntu-latest"],
      permissions: {
        idToken: github.workflows.JobPermission.WRITE,
        contents: github.workflows.JobPermission.READ,
      },
      if: "needs.release.outputs.tag_exists != 'true' && needs.release.outputs.latest_commit == github.sha",
      steps: [
        {
          uses: "actions/setup-node@v4",
          with: { "node-version": "lts/*" },
        },
        {
          name: "Download build artifacts",
          uses: "actions/download-artifact@v4",
          with: {
            name: "build-artifact",
            path: "dist",
          },
        },
        {
          name: "Restore build artifact permissions",
          run: "cd dist && setfacl --restore=permissions-backup.acl",
          continueOnError: true,
        },
        {
          name: "Checkout",
          uses: "actions/checkout@v4",
          with: { path: ".repo" },
        },
        {
          name: "Install Dependencies",
          run: "cd .repo && yarn install --check-files --frozen-lockfile",
        },
        {
          name: "Extract build artifact",
          run: "tar --strip-components=1 -xzvf dist/js/*.tgz -C .repo",
        },
        {
          name: "Move build artifact out of the way",
          run: "mv dist dist.old",
        },
        {
          name: "Create js artifact",
          run: "cd .repo && npx projen package:js",
        },
        {
          name: "Collect js artifact",
          run: "mv .repo/dist dist",
        },
        {
          name: "Release",
          env: {
            NPM_DIST_TAG: "latest",
            NPM_REGISTRY: "registry.npmjs.org",
            NPM_CONFIG_PROVENANCE: "true",
            NPM_TOKEN: "${{ secrets.NPM_TOKEN }}",
          },
          run: "npx -p publib@latest publib-npm",
        },
      ],
    },
  });
}
project.synth();
