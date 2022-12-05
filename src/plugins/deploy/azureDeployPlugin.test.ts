import { Site } from "@azure/arm-appservice/esm/models";
import Serverless from "serverless";
import { DeploymentConfig, ServerlessAzureConfig, ServerlessAzureOptions, ServerlessAzureProvider } from "../../models/serverless";
import { ApimService } from "../../services/apimService";
import { ConfigService } from "../../services/configService";
import { FunctionAppService } from "../../services/functionAppService";
import { ResourceService } from "../../services/resourceService";
import { MockFactory } from "../../test/mockFactory";
import { invokeHook } from "../../test/utils";
import { AzureDeployPlugin } from "./azureDeployPlugin";
import mockFs  from "mock-fs"

jest.mock("../../services/apimService");
jest.mock("../../services/functionAppService");
jest.mock("../../services/resourceService");
jest.mock("../../services/configService");

describe("Deploy plugin", () => {
  let sls: Serverless;
  let options: ServerlessAzureOptions;
  let plugin: AzureDeployPlugin;

  beforeAll(() => {
    mockFs({
      "serviceName.zip": "contents",
    }, { createCwd: true, createTmp: true });
  });

  beforeEach(() => {
    FunctionAppService.prototype.getFunctionZipFile = jest.fn(() => "serviceName.zip");
    ApimService.prototype.deploy = jest.fn();

    sls = MockFactory.createTestServerless();
    options = MockFactory.createTestServerlessOptions();

    plugin = new AzureDeployPlugin(sls, options);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  afterAll(() => {
    mockFs.restore();
  })

  it("calls deploy", async () => {
    const deployResourceGroup = jest.fn();
    const functionAppStub: Site = MockFactory.createTestSite();
    const deploy = jest.fn(() => Promise.resolve(functionAppStub));
    const getDeploymentSlot = jest.fn(() => "");
    const uploadFunctions = jest.fn();

    ResourceService.prototype.deployResourceGroup = deployResourceGroup;
    FunctionAppService.prototype.deploy = deploy;
    FunctionAppService.prototype.uploadFunctions = uploadFunctions;
    ConfigService.prototype.getDeploymentSlot = getDeploymentSlot;

    await invokeHook(plugin, "deploy:deploy");

    expect(deployResourceGroup).toBeCalled();
    expect(deploy).toBeCalled();
    expect(getDeploymentSlot).toBeCalled();
    expect(uploadFunctions).toBeCalledWith(functionAppStub);
  });

  it("Crashes deploy if function is specified", async () => {
    plugin = new AzureDeployPlugin(sls, { function: "myFunction" } as any);
    await expect(invokeHook(plugin, "deploy:deploy"))
      .rejects.toThrow("The Azure Functions plugin does not currently support deployments of individual functions. " +
        "Azure Functions are zipped up as a package and deployed together as a unit");
  });

  it("lists deployments from sub-command", async () => {
    const deploymentString = "deployments";
    ResourceService.prototype.listDeployments = jest.fn(() => Promise.resolve(deploymentString));
    await invokeHook(plugin, "deploy:list:list");
    expect(ResourceService.prototype.listDeployments).toBeCalled();
    expect(sls.cli.log).lastCalledWith(deploymentString);
  });

  it("deploys APIM from sub-command if configured", async () => {
    (sls.service as any as ServerlessAzureConfig).provider.apim = {} as any;
    plugin = new AzureDeployPlugin(sls, {} as any);
    await invokeHook(plugin, "deploy:apim:apim");
    expect(ApimService.prototype.deploy).toBeCalled();
  });

  it("skips deployment of APIM from sub-command if not configured", async () => {
    delete (sls.service as any as ServerlessAzureConfig).provider.apim;
    plugin = new AzureDeployPlugin(sls, {} as any);
    await invokeHook(plugin, "deploy:apim:apim");
    expect(ApimService.prototype.deploy).not.toBeCalled();
  });

  it("crashes deploy list if function is specified", async () => {
    plugin = new AzureDeployPlugin(sls, { function: "myFunction" } as any);
    await expect(invokeHook(plugin, "deploy:list:list"))
      .rejects.toThrow("The Azure Functions plugin does not currently support deployments of individual functions. " +
        "Azure Functions are zipped up as a package and deployed together as a unit");
  });

  it("crashes deploy if zip file is not found", async () => {
    FunctionAppService.prototype.getFunctionZipFile = jest.fn(() => "notExisting.zip");
    await expect(invokeHook(plugin, "deploy:deploy"))
      .rejects.toThrow(/Function app zip file '.*' does not exist/)
  });

  it.each([
    ["staging", "staging", "staging"],
    ["staging", "canary", "canary"],
    ["staging", "production", "production"],
    ["canary", "canary", "canary"],
    ["canary", "staging", "staging"],
    ["canary", "production", "production"],
    ["prod", "prod", "prod"],
    ["production", "production", "production"],
    ["", "", "staging"],
  ])("given configured slot: %s, and --slot %s, should use correct slot", async (configuredSlot: string, optionSlot: string, correctSlot: string) => {
    const deployResourceGroup = jest.fn();
    const functionAppStub: Site = MockFactory.createTestSite();
    const deploy = jest.fn(() => Promise.resolve(functionAppStub));
    const getDeploymentSlot = jest.fn(() => correctSlot);
    const uploadFunctions = jest.fn();

    // The slot mocks what would be set in the serverless.yml for the slot
    sls = MockFactory.createTestServerless(null, {
      deployment: {
        slot: configuredSlot
      } as DeploymentConfig
    } as ServerlessAzureProvider);

    // This mimicks what the slot is passed in through the command line
    options = MockFactory.createTestServerlessOptions({
      slot: optionSlot
    });
    plugin = new AzureDeployPlugin(sls, options);

    ResourceService.prototype.deployResourceGroup = deployResourceGroup;
    FunctionAppService.prototype.deploy = deploy;
    FunctionAppService.prototype.uploadFunctions = uploadFunctions;
    ConfigService.prototype.getDeploymentSlot = getDeploymentSlot;

    await expect(invokeHook(plugin, "deploy:deploy")).resolves.toBeFalsy();
    expect(deployResourceGroup).toBeCalled();
    expect(deploy).toBeCalledWith(correctSlot)
    expect(uploadFunctions).toBeCalledWith(functionAppStub);
  });
});
