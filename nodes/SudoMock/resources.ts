import type { INodeProperties } from "n8n-workflow";

const RESOURCES = [
  {
    name: "Account",
    value: "account",
    default: "getAccountInfo",
    operations: ["getAccountInfo"],
  },
  {
    name: "Artwork",
    value: "artwork",
    default: "deleteArtworks",
    operations: ["deleteArtworks"],
  },
  {
    name: "Font",
    value: "font",
    default: "listFonts",
    operations: ["deleteFont", "getFont", "listFonts", "uploadFont"],
  },
  {
    name: "Image",
    value: "image",
    default: "removeBackground",
    operations: ["removeBackground"],
  },
  {
    name: "Job",
    value: "job",
    default: "getJob",
    operations: ["getJob", "listJobs"],
  },
  {
    name: "Photo Mockup",
    value: "photoMockup",
    default: "render2DMockup",
    operations: [
      "create2DMockup",
      "delete2DMockup",
      "get2DMockup",
      "list2DMockups",
      "render2DMockup",
      "set2DPrintAreas",
    ],
  },
  {
    name: "PSD Mockup",
    value: "psdMockup",
    default: "render",
    operations: [
      "deleteMockup",
      "getMockup",
      "listMockups",
      "render",
      "updateMockup",
      "uploadPsd",
    ],
  },
  {
    name: "Video",
    value: "video",
    default: "renderVideo",
    operations: ["renderVideo"],
  },
  {
    name: "Webhook",
    value: "webhook",
    default: "webhookList",
    operations: [
      "webhookCreate",
      "webhookDelete",
      "webhookEventsFeed",
      "webhookGet",
      "webhookListDeliveries",
      "webhookList",
      "webhookReplayDelivery",
      "webhookReplayFailed",
      "webhookRotateSecret",
      "webhookTest",
      "webhookUpdate",
    ],
  },
];

/** Group new nodes without hiding parameters in workflows saved with node version 1. */
export function resourceProperties(
  operation: INodeProperties,
): INodeProperties[] {
  return [
    {
      displayName: "Resource",
      name: "resource",
      type: "options",
      noDataExpression: true,
      displayOptions: { show: { "@version": [2] } },
      options: RESOURCES.map(({ name, value }) => ({ name, value })),
      default: "psdMockup",
    },
    // n8n removes hidden parameters when loading a workflow. Keep the version-1
    // selector so existing workflows retain their operation and all its fields.
    { ...operation, displayOptions: { show: { "@version": [1] } } },
    ...RESOURCES.map(
      (resource): INodeProperties => ({
        ...operation,
        displayOptions: {
          show: { "@version": [2], resource: [resource.value] },
        },
        options: operation.options?.filter(
          (option) =>
            "value" in option &&
            resource.operations.includes(String(option.value)),
        ),
        default: resource.default,
      }),
    ),
  ];
}
