import React, { useEffect, useState, useCallback } from "react";
import {
  Box,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  Alert,
  Skeleton,
  IconButton,
  SvgIcon,
  Stack,
  Chip,
  Typography,
  Tabs,
  Tab,
} from "@mui/material";
import { Grid } from "@mui/system";
import { ApiGetCall, ApiPostCall } from "/src/api/ApiCall";
import { CippDataTable } from "../CippTable/CippDataTable";
import { PlusIcon, ShieldCheckIcon, WrenchIcon } from "@heroicons/react/24/outline";
import CippFormComponent from "./CippFormComponent";
import {
  Apps,
  Delete,
  Download,
  Error,
  ExpandMore,
  Save,
  Sync,
  TaskAlt,
  Undo,
  Upload,
  WarningAmberOutlined,
} from "@mui/icons-material";
import { useWatch } from "react-hook-form";
import { CippCardTabPanel } from "./CippCardTabPanel";
import { CippApiResults } from "./CippApiResults";
import _ from "lodash";
import { CippCodeBlock } from "./CippCodeBlock";
import { CippOffCanvas } from "./CippOffCanvas";
import { FileDropzone } from "../file-dropzone";
import { ConfirmationDialog } from "../confirmation-dialog";

const CippAppPermissionBuilder = ({
  onSubmit,
  updatePermissions,
  currentPermissions = {},
  removePermissionConfirm = false,
  appDisplayName = "CIPP-SAM",
  formControl,
}) => {
  const [selectedApp, setSelectedApp] = useState([]);
  const [permissionsImported, setPermissionsImported] = useState(false);
  const [newPermissions, setNewPermissions] = useState({});
  const [importedManifest, setImportedManifest] = useState(null);
  const [manifestVisible, setManifestVisible] = useState(false);
  const [manifestError, setManifestError] = useState(false);
  const [calloutMessage, setCalloutMessage] = useState(null);
  const [initialPermissions, setInitialPermissions] = useState();
  const [additionalPermissionsDialog, setAdditionalPermissionsDialog] = useState(false);
  const [additionalPermissions, setAdditionalPermissions] = useState([]);
  const [removePermissionDialog, setRemovePermissionDialog] = useState(false);
  const [spToRemove, setSpToRemove] = useState(null);
  const [resetPermissionDialog, setResetPermissionDialog] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleChange = (panel) => (event, newExpanded) => {
    setExpanded(newExpanded ? panel : false);
  };

  const deprecatedServicePrincipals = [
    "00000002-0000-0000-c000-000000000000", // Windows Azure Active Directory
    "a0c73c16-a7e3-4564-9a95-2bdf47383716", // Microsoft Exchange Online Remote PowerShell
    "1b730954-1685-4b74-9bfd-dac224a7b894", // Azure Active Directory PowerShell
  ];

  const currentSelectedSp = useWatch({ control: formControl.control, name: "servicePrincipal" });

  // Check if selected service principal is in the deprecated list
  const isDeprecatedSp =
    currentSelectedSp && deprecatedServicePrincipals.includes(currentSelectedSp.value);

  const {
    data: servicePrincipals = [],
    isSuccess: spSuccess,
    isFetching: spFetching,
    isLoading: spLoading,
    refetch: refetchServicePrincipals,
  } = ApiGetCall({
    url: "/api/ExecServicePrincipals",
    queryKey: "execServicePrincipalList",
    waiting: true,
  });

  const removeServicePrincipal = useCallback(
    (appId, isConfirm) => {
      const newServicePrincipals = selectedApp.filter((sp) => sp?.appId !== appId);

      if (!isConfirm && removePermissionConfirm) {
        setSpToRemove(appId);
        setRemovePermissionDialog(true);
        return;
      }

      // Only update selectedApp if there is a change
      setSelectedApp((prevSelectedApp) => {
        if (prevSelectedApp.length !== newServicePrincipals.length) {
          return newServicePrincipals;
        }
        return prevSelectedApp;
      });

      // Update newPermissions by creating a shallow copy and deleting the entry
      setNewPermissions((prevPermissions) => {
        if (prevPermissions.Permissions[appId]) {
          const updatedPermissions = {
            ...prevPermissions,
            Permissions: { ...prevPermissions.Permissions },
          };
          delete updatedPermissions.Permissions[appId];
          return updatedPermissions;
        }
        return prevPermissions;
      });
    },
    [selectedApp, newPermissions, removePermissionConfirm, removePermissionDialog]
  );

  const createServicePrincipal = ApiPostCall({
    urlFromData: true,
    relatedQueryKeys: ["execServicePrincipals"],
  });

  const confirmReset = (isConfirm) => {
    if (!isConfirm && removePermissionConfirm) {
      setResetPermissionDialog(true);
    } else {
      setSelectedApp([]);
      setPermissionsImported(false);
      setManifestVisible(false);
      setCalloutMessage("Permissions reset to default.");
    }
  };

  const handleSubmit = (values) => {
    if (onSubmit) {
      var postBody = {
        Permissions: newPermissions.Permissions,
      };
      onSubmit(postBody);
    }
  };

  const onCreateServicePrincipal = (newValue) => {
    if (newValue.value) {
      createServicePrincipal.mutate({
        url: "/api/ExecServicePrincipals?Action=Create&AppId=" + newValue.value,
        data: {},
      });
    }
  };

  const savePermissionChanges = (
    servicePrincipal,
    applicationPermissions,
    delegatedPermissions
  ) => {
    setNewPermissions((prevPermissions) => {
      const updatedPermissions = {
        ...prevPermissions,
        Permissions: {
          ...prevPermissions.Permissions,
          [servicePrincipal]: {
            applicationPermissions,
            delegatedPermissions,
          },
        },
      };
      return updatedPermissions;
    });

    setExpanded(false);
  };

  const generateManifest = ({ appDisplayName = "CIPP-SAM", prompt = false }) => {
    if (prompt || appDisplayName === "") {
      ModalService.prompt({
        title: "Generate Manifest",
        body: "Please enter the display name for the application.",
        onConfirm: (value) => {
          generateManifest({ appDisplayName: value });
        },
      });
    } else {
      var manifest = {
        isFallbackPublicClient: true,
        signInAudience: "AzureADMultipleOrgs",
        displayName: appDisplayName,
        web: {
          redirectUris: [
            "https://login.microsoftonline.com/common/oauth2/nativeclient",
            "https://localhost",
            "http://localhost",
            "http://localhost:8400",
          ],
        },
        requiredResourceAccess: [],
      };

      var newAdditionalPermissions = [];

      selectedApp.map((sp) => {
        var appRoles = newPermissions?.Permissions[sp.appId]?.applicationPermissions;
        var delegatedPermissions = newPermissions?.Permissions[sp.appId]?.delegatedPermissions;
        var requiredResourceAccess = {
          resourceAppId: sp.appId,
          resourceAccess: [],
        };
        var additionalRequiredResourceAccess = {
          resourceAppId: sp.appId,
          resourceAccess: [],
        };
        if (appRoles) {
          appRoles.map((role) => {
            requiredResourceAccess.resourceAccess.push({
              id: role.id,
              type: "Role",
            });
          });
        }
        if (delegatedPermissions) {
          delegatedPermissions.map((perm) => {
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(perm.id)) {
              requiredResourceAccess.resourceAccess.push({
                id: perm.id,
                type: "Scope",
              });
            } else {
              additionalRequiredResourceAccess.resourceAccess.push({
                id: perm.id,
                type: "Scope",
              });
            }
          });
        }
        if (requiredResourceAccess.resourceAccess.length > 0) {
          manifest.requiredResourceAccess.push(requiredResourceAccess);
        }
        if (additionalRequiredResourceAccess.resourceAccess.length > 0) {
          newAdditionalPermissions.push(additionalRequiredResourceAccess);
        }
      });

      var fileName = `${appDisplayName.replace(" ", "-")}.json`;
      if (appDisplayName === "CIPP-SAM") {
        fileName = "SAMManifest.json";
      }

      var blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}`;
      a.click();
      URL.revokeObjectURL(url);

      if (newAdditionalPermissions.length > 0) {
        setAdditionalPermissionsDialog(true);
        setAdditionalPermissions(newAdditionalPermissions);
      }
    }
  };

  const importManifest = () => {
    var updatedPermissions = { Permissions: {} };
    var manifest = importedManifest;
    var requiredResourceAccess = manifest.requiredResourceAccess;
    var selectedServicePrincipals = [];

    requiredResourceAccess.map((resourceAccess) => {
      var sp = servicePrincipals?.Results?.find((sp) => sp.appId === resourceAccess.resourceAppId);
      if (sp) {
        var appRoles = [];
        var delegatedPermissions = [];
        selectedServicePrincipals.push(sp);
        resourceAccess.resourceAccess.map((access) => {
          if (access.type === "Role") {
            var role = sp.appRoles.find((role) => role.id === access.id);
            if (role) {
              appRoles.push({
                id: role.id,
                value: role.value,
              });
            }
          } else if (access.type === "Scope") {
            var scope = sp.publishedPermissionScopes.find((scope) => scope.id === access.id);
            if (scope) {
              delegatedPermissions.push({
                id: scope.id,
                value: scope.value,
              });
            }
          }
        });
        updatedPermissions.Permissions[sp.appId] = {
          applicationPermissions: appRoles,
          delegatedPermissions: delegatedPermissions,
        };
      }
    });
    setNewPermissions(updatedPermissions);
    setSelectedApp(selectedServicePrincipals);
    setImportedManifest(null);
    setPermissionsImported(true);
    setManifestVisible(false);
    setCalloutMessage("Manifest imported successfully.");
  };

  const onManifestImport = useCallback((acceptedFiles) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onabort = () => console.log("file reading was aborted");
      reader.onerror = () => console.log("file reading has failed");
      reader.onload = () => {
        try {
          var manifest = JSON.parse(reader.result);
        } catch {
          setManifestError(true);
          return;
        }
        const requiredProperties = [
          "isFallbackPublicClient",
          "signInAudience",
          "displayName",
          "web",
          "requiredResourceAccess",
        ];
        var isManifestValid = true;
        requiredProperties.forEach((key) => {
          if (!Object.keys(manifest).includes(key)) {
            isManifestValid = false;
            return;
          }
        });
        if (isManifestValid) {
          setImportedManifest(manifest);
          setManifestError(false);
        } else {
          setManifestError(true);
          setImportedManifest(false);
        }
      };
      reader.readAsText(file);
    });
  }, []);

  useEffect(() => {
    if (spSuccess) {
      try {
        var initialAppIds = Object.keys(currentPermissions?.Permissions);
      } catch {
        initialAppIds = [];
      }

      if (selectedApp.length === 0 && initialAppIds.length === 0) {
        var microsoftGraph = servicePrincipals?.Results?.find(
          (sp) => sp?.appId === "00000003-0000-0000-c000-000000000000"
        );
        if (microsoftGraph) {
          setSelectedApp([microsoftGraph]); // Ensure this does not trigger a loop
          setNewPermissions({
            Permissions: {
              "00000003-0000-0000-c000-000000000000": {
                applicationPermissions: [],
                delegatedPermissions: [],
              },
            },
          });
          setExpanded("00000003-0000-0000-c000-000000000000"); // Automatically expand Microsoft Graph
        }
      } else if (!_.isEqual(currentPermissions, initialPermissions)) {
        setSelectedApp([]); // Avoid redundant updates
        setNewPermissions(currentPermissions);
        setInitialPermissions(currentPermissions);
        setPermissionsImported(false);
      } else if (initialAppIds.length > 0 && !permissionsImported) {
        const newApps = servicePrincipals?.Results?.filter((sp) =>
          initialAppIds.includes(sp.appId)
        )?.sort((a, b) => a.displayName.localeCompare(b.displayName));

        if (!_.isEqual(selectedApp, newApps)) {
          setSelectedApp(newApps); // Prevent unnecessary updates
        }

        setNewPermissions(currentPermissions);
        setInitialPermissions(currentPermissions);
        setPermissionsImported(true);

        // Automatically expand if only one service principal exists
        if (newApps.length === 1) {
          setExpanded(newApps[0].appId);
        }
      }
    }
  }, [
    currentPermissions,
    initialPermissions,
    permissionsImported,
    selectedApp,
    servicePrincipals,
    spSuccess,
  ]);

  const getPermissionCounts = (appId) => {
    var appRoles = newPermissions?.Permissions[appId]?.applicationPermissions;
    var delegatedPermissions = newPermissions?.Permissions[appId]?.delegatedPermissions;

    var counts = `${appRoles?.length ?? 0}/${delegatedPermissions?.length ?? 0}`;
    return counts;
  };

  const ApiPermissionRow = ({ servicePrincipal = null, spPermissions, formControl }) => {
    const [value, setValue] = useState(0);
    const [spInitialized, setSpInitialized] = useState(false);
    const [appTable, setAppTable] = useState([]);
    const [delegatedTable, setDelegatedTable] = useState([]);
    const [permissionsChanged, setPermissionsChanged] = useState(false);

    const {
      data: spInfo = [],
      isSuccess: spInfoSuccess,
      isFetching: spInfoFetching,
    } = ApiGetCall({
      url: `/api/ExecServicePrincipals?Id=${servicePrincipal.id}`,
      queryKey: `execServicePrincipals-${servicePrincipal.id}`,
      waiting: true,
    });

    //console.log(spInfo);

    const currentAppPermission = useWatch({
      control: formControl.control,
      name: `Permissions.${servicePrincipal.appId}.applicationPermissions`,
    });
    const currentDelegatedPermission = useWatch({
      control: formControl.control,
      name: `Permissions.${servicePrincipal.appId}.delegatedPermissions`,
    });

    useEffect(() => {
      if (spInfoSuccess && !spInitialized) {
        if (appTable !== undefined && appTable?.length === 0) {
          setAppTable(
            spPermissions?.applicationPermissions
              ?.sort((a, b) => a.value.localeCompare(b.value))
              ?.map((perm) => ({
                id: perm.id,
                value: perm.value,
                description: spInfo?.Results?.appRoles.find((role) => role.id === perm.id)
                  ?.description,
              }))
          );
        }
        if (delegatedTable !== undefined && delegatedTable.length === 0) {
          setDelegatedTable(
            spPermissions?.delegatedPermissions
              ?.sort((a, b) => a.value.localeCompare(b.value))
              ?.map((perm) => ({
                id: perm.id,
                value: perm.value,
                description:
                  spInfo?.Results?.publishedPermissionScopes.find((scope) => scope.id === perm.id)
                    ?.userConsentDescription ?? "Manually added",
              }))
          );
        }
        setSpInitialized(true);
      }
    }, [spInitialized, spInfoSuccess, appTable, delegatedTable]);

    useEffect(() => {
      if (spInfoSuccess && appTable !== undefined && delegatedTable !== undefined) {
        var appRoles = appTable?.map((perm) => perm.id).sort();
        var delegatedPermissions = delegatedTable?.map((perm) => perm.id).sort();
        var originalAppRoles = spPermissions?.applicationPermissions.map((perm) => perm.id).sort();
        var originalDelegatedPermissions = spPermissions?.delegatedPermissions
          .map((perm) => perm.id)
          .sort();
        if (
          JSON.stringify(appRoles) !== JSON.stringify(originalAppRoles) ||
          JSON.stringify(delegatedPermissions) !== JSON.stringify(originalDelegatedPermissions)
        ) {
          setPermissionsChanged(true);
        } else {
          setPermissionsChanged(false);
        }
      }
    }, [appTable, delegatedTable, spInfoSuccess, spPermissions]);

    const handleAddRow = (permissionType, permission) => {
      if (permissionType === "applicationPermissions") {
        var newAppPermission = {
          id: permission.value,
          value: permission.label,
          description: spInfo?.Results?.appRoles.find((role) => role.id === permission.value)
            ?.description,
        };
        setAppTable([...(appTable ?? []), newAppPermission]);
        formControl.setValue(`Permissions.${servicePrincipal.appId}.applicationPermissions`, null);
      } else {
        var newDelegatedPermission = {
          id: permission.value,
          value: permission.label,
          description: spInfo?.Results?.publishedPermissionScopes.find(
            (scope) => scope.id === permission.value
          )?.userConsentDescription,
        };
        setDelegatedTable([...(delegatedTable ?? []), newDelegatedPermission]);
        formControl.setValue(`Permissions.${servicePrincipal.appId}.delegatedPermissions`, null);
      }
    };

    const handleRemoveRow = (permissionType, permission) => {
      if (permission?.id) {
        if (permissionType === "applicationPermissions") {
          setAppTable((prevAppTable) => prevAppTable.filter((perm) => perm.id !== permission.id));
        } else {
          setDelegatedTable((prevDelegatedTable) =>
            prevDelegatedTable.filter((perm) => perm.id !== permission.id)
          );
        }
      }
    };

    const handleSavePermissions = () => {
      savePermissionChanges(
        servicePrincipal.appId,
        appTable?.map((perm) => ({ id: perm.id, value: perm.value })) ?? [],
        delegatedTable?.map((perm) => ({ id: perm.id, value: perm.value })) ?? []
      );
    };

    function tabProps(index) {
      return {
        id: `simple-tab-${index}`,
        "aria-controls": `simple-tabpanel-${index}`,
      };
    }

    const handleTabChange = (event, newValue) => {
      setValue(newValue);
    };

    return (
      <>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
          Manage the permissions for the {servicePrincipal.displayName}.
        </Typography>

        <Box sx={{ width: "100%" }}>
          <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
            <Tabs
              value={value}
              onChange={handleTabChange}
              aria-label={`Permissions for ${servicePrincipal.displayName}`}
            >
              <Tab label="Application" {...tabProps(0)} />
              <Tab label="Delegated" {...tabProps(1)} />
            </Tabs>
          </Box>
          <CippCardTabPanel value={value} index={0}>
            {servicePrincipal?.appRoles?.length > 0 ? (
              <>
                <Stack spacing={2}>
                  <Grid container sx={{ display: "flex", alignItems: "center" }} spacing={2}>
                    <Grid size={{ xl: 8, xs: 12 }}>
                      <CippFormComponent
                        type="autoComplete"
                        label="Application Permissions"
                        name={`Permissions.${servicePrincipal.appId}.applicationPermissions`}
                        isFetching={spInfoFetching}
                        options={(spInfo?.Results?.appRoles || [])
                          .filter((role) => !appTable?.find((perm) => perm.id === role.id))
                          .map((role) => ({
                            label: role.value,
                            value: role.id,
                          }))}
                        formControl={formControl}
                        multiple={false}
                      />
                    </Grid>
                    <Grid>
                      <Tooltip title="Add Permission">
                        <div
                          onClick={() =>
                            handleAddRow("applicationPermissions", currentAppPermission)
                          }
                        >
                          <Button variant="outlined" disabled={!currentAppPermission}>
                            <SvgIcon fontSize="small">
                              <PlusIcon />
                            </SvgIcon>
                          </Button>
                        </div>
                      </Tooltip>
                    </Grid>
                  </Grid>
                  <CippDataTable
                    title={`${servicePrincipal.displayName} Application Permissions`}
                    noCard={true}
                    data={appTable ?? []}
                    simpleColumns={["value", "description"]}
                    actions={[
                      {
                        label: "Delete Permission",
                        icon: <Delete />,
                        noConfirm: true,
                        customFunction: (row) => handleRemoveRow("applicationPermissions", row),
                      },
                    ]}
                    isFetching={spInfoFetching}
                  />
                </Stack>
              </>
            ) : (
              <Alert color="warning" icon={<WarningAmberOutlined />} sx={{ mb: 3 }}>
                No Application Permissions found.
              </Alert>
            )}
          </CippCardTabPanel>
          <CippCardTabPanel value={value} index={1}>
            <Stack spacing={2}>
              {spInfo?.Results?.publishedPermissionScopes?.length === 0 && (
                <Alert color="warning" icon={<WarningAmberOutlined />}>
                  No Published Delegated Permissions found.
                </Alert>
              )}
              <Grid container sx={{ display: "flex", alignItems: "center" }} spacing={2}>
                <Grid size={{ xl: 8, xs: 12 }}>
                  <CippFormComponent
                    type="autoComplete"
                    label="Delegated Permissions"
                    name={`Permissions.${servicePrincipal.appId}.delegatedPermissions`}
                    isFetching={spInfoFetching}
                    options={(spInfo?.Results?.publishedPermissionScopes || [])
                      .filter((scope) => !delegatedTable?.find((perm) => perm.id === scope.id))
                      .map((scope) => ({
                        label: scope.value,
                        value: scope.id,
                      }))}
                    formControl={formControl}
                    multiple={false}
                  />
                </Grid>
                <Grid sx={{ ms: 2 }}>
                  <Tooltip title="Add Permission">
                    <div
                      onClick={() =>
                        handleAddRow("delegatedPermissions", currentDelegatedPermission)
                      }
                    >
                      <Button variant="outlined" disabled={!currentDelegatedPermission}>
                        <SvgIcon fontSize="small">
                          <PlusIcon />
                        </SvgIcon>
                      </Button>
                    </div>
                  </Tooltip>
                </Grid>
              </Grid>

              <CippDataTable
                noCard={true}
                sx={{ width: "100%" }}
                title={`${servicePrincipal.displayName} Delegated Permissions`}
                data={delegatedTable ?? []}
                simpleColumns={["value", "description"]}
                actions={[
                  {
                    label: "Delete Permission",
                    icon: <Delete />,
                    noConfirm: true,
                    customFunction: (row) => handleRemoveRow("delegatedPermissions", row),
                  },
                ]}
                isFetching={spInfoFetching}
              />
            </Stack>
          </CippCardTabPanel>

          <Button
            variant="contained"
            startIcon={<Save />}
            onClick={handleSavePermissions}
            disabled={!permissionsChanged}
          >
            Save Changes
          </Button>
        </Box>
      </>
    );
  };

  return (
    <>
      {spLoading && <Skeleton variant="rectangle" height={300} />}
      {spSuccess && (
        <>
          <Grid container>
            <Grid size={{ xl: 12, md: 12 }} sx={{ mb: 3 }}>
              <Grid
                container
                spacing={2}
                sx={{ display: "flex", alignItems: "center" }}
                justifyContent="space-between"
              >
                <Grid size={{ xl: 8, xs: 12 }}>
                  <Stack direction="row" spacing={1}>
                    {servicePrincipals?.Metadata?.Success && (
                      <Box width="100%">
                        <CippFormComponent
                          type="autoComplete"
                          fullWidth
                          label="Add a Service Principal (optional)"
                          placeholder="Select a Service Principal or enter an AppId if not listed"
                          name="servicePrincipal"
                          createOption={true}
                          onCreateOption={onCreateServicePrincipal}
                          isFetching={spFetching}
                          options={servicePrincipals?.Results.map((sp) => {
                            return { label: `${sp.displayName} (${sp.appId})`, value: sp.appId };
                          })}
                          formControl={formControl}
                          multiple={false}
                        />
                      </Box>
                    )}
                    <IconButton
                      onClick={() => refetchServicePrincipals()}
                      disabled={servicePrincipals.isFetching}
                    >
                      <Sync />
                    </IconButton>
                  </Stack>
                </Grid>
                <Grid>
                  <Stack direction="row" spacing={1}>
                    <Tooltip
                      title={
                        isDeprecatedSp
                          ? "This service principal is deprecated and cannot be added"
                          : "Add Service Principal"
                      }
                    >
                      <div
                        onClick={(e) => {
                          // Only add if not deprecated
                          if (!isDeprecatedSp) {
                            setSelectedApp([
                              ...selectedApp,
                              servicePrincipals?.Results?.find(
                                (sp) => sp.appId === currentSelectedSp.value
                              ),
                            ]);
                            formControl.setValue("servicePrincipal", null);
                          }
                        }}
                      >
                        <Button
                          variant="contained"
                          component={!currentSelectedSp?.value ? "span" : undefined}
                          disabled={!currentSelectedSp?.value || isDeprecatedSp}
                        >
                          <SvgIcon fontSize="small">
                            <PlusIcon />
                          </SvgIcon>
                        </Button>
                      </div>
                    </Tooltip>

                    <Tooltip title="Reset to Default">
                      <Button
                        onClick={() => {
                          confirmReset();
                        }}
                        variant="outlined"
                      >
                        <SvgIcon fontSize="small">
                          <Undo />
                        </SvgIcon>
                      </Button>
                    </Tooltip>
                    <Tooltip title="Download Manifest">
                      <Button
                        variant="outlined"
                        onClick={() => {
                          generateManifest({ appDisplayName: appDisplayName });
                        }}
                      >
                        <SvgIcon fontSize="small">
                          <Download />
                        </SvgIcon>
                      </Button>
                    </Tooltip>

                    <Tooltip title="Import Manifest">
                      <Button
                        variant="outlined"
                        onClick={() => {
                          setManifestVisible(true);
                        }}
                      >
                        <SvgIcon fontSize="small">
                          <Upload />
                        </SvgIcon>
                      </Button>
                    </Tooltip>
                  </Stack>
                </Grid>
              </Grid>
              <Grid
                size={12}
                sx={{
                  mt: createServicePrincipal.isSuccess || createServicePrincipal.isPending ? 3 : 0,
                }}
              >
                <CippApiResults apiObject={createServicePrincipal} />
              </Grid>
              <CippOffCanvas
                visible={manifestVisible}
                size="lg"
                onClose={() => {
                  setManifestVisible(false);
                }}
              >
                <Grid container>
                  <Grid size={12}>
                    <Typography variant="h4" sx={{ mb: 2 }}>
                      Import Permission Manifest
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 3 }}>
                      Import a JSON application manifest to set permissions. This will overwrite any
                      existing permissions. You can obtain one from an App Registration in the Entra
                      portal. Just click on Manifest and download the JSON file.
                    </Typography>
                  </Grid>
                </Grid>
                <Grid container>
                  <Grid size={12}>
                    <FileDropzone
                      onDrop={onManifestImport}
                      accept={{
                        "application/json": [".json"],
                      }}
                      caption="Drag a JSON app manifest here, or click to select one."
                      maxFiles={1}
                      returnCard={false}
                    />
                  </Grid>
                </Grid>
                {manifestError && (
                  <Alert color="error" icon={<Error />} sx={{ mt: 4 }}>
                    Invalid manifest. Please ensure the manifest is in the correct format.
                  </Alert>
                )}
                {importedManifest && (
                  <>
                    <Grid container sx={{ mt: 2 }} spacing={2}>
                      <Grid size={12}>
                        <Alert color="success" icon={<TaskAlt />}>
                          Manifest is valid. Click Import to apply the permissions.
                        </Alert>
                      </Grid>
                      <Grid size={12}>
                        <Button
                          variant="contained"
                          onClick={() => importManifest()}
                          startIcon={
                            <SvgIcon fontSize="small">
                              <Save />
                            </SvgIcon>
                          }
                        >
                          Import
                        </Button>
                      </Grid>
                    </Grid>
                    <Grid container className="mt-3">
                      <Grid size={12}>
                        <h4>Preview</h4>
                        <CippCodeBlock
                          code={JSON.stringify(importedManifest, null, 2)}
                          language="json"
                          showLineNumbers={false}
                        />
                      </Grid>
                    </Grid>
                  </>
                )}
              </CippOffCanvas>
              {calloutMessage && (
                <Grid container>
                  <Grid size={{ xl: 8, xs: 12 }}>
                    <Alert variant="outlined" color="info" onClose={() => setCalloutMessage(null)}>
                      {calloutMessage}
                    </Alert>
                  </Grid>
                </Grid>
              )}

              {isDeprecatedSp && (
                <Grid container>
                  <Grid size={{ xl: 8, xs: 12 }}>
                    <Alert color="error" icon={<WarningAmberOutlined />}>
                      {currentSelectedSp.label} is deprecated and cannot be added. Please select a
                      different service principal.
                    </Alert>
                  </Grid>
                </Grid>
              )}

              {newPermissions?.MissingPermissions &&
                newPermissions?.Type === "Table" &&
                Object.keys(newPermissions?.MissingPermissions).length > 0 && (
                  <Grid container sx={{ width: "100%", mt: 3 }}>
                    <Grid size={{ xl: 8, xs: 12 }}>
                      <Alert
                        color="warning"
                        icon={<WarningAmberOutlined />}
                        action={
                          <Tooltip title="Add Missing Permissions">
                            <IconButton
                              onClick={() => {
                                var updatedPermissions = JSON.parse(JSON.stringify(newPermissions));
                                Object.keys(newPermissions?.MissingPermissions).map((perm) => {
                                  Object.keys(newPermissions?.MissingPermissions[perm]).map(
                                    (type) => {
                                      if (!updatedPermissions.Permissions[perm][type]) {
                                        updatedPermissions.Permissions[perm][type] = [];
                                      }
                                      newPermissions?.MissingPermissions[perm][type].map((p) => {
                                        updatedPermissions.Permissions[perm][type].push(p);
                                      });
                                    }
                                  );
                                });
                                updatedPermissions.MissingPermissions = {};
                                setNewPermissions(updatedPermissions);
                              }}
                            >
                              <SvgIcon fontSize="small">
                                <WrenchIcon />
                              </SvgIcon>
                            </IconButton>
                          </Tooltip>
                        }
                      >
                        <b>New Permissions Available</b>
                        {Object.keys(newPermissions?.MissingPermissions).map((perm) => {
                          // translate appid to display name
                          var sp = servicePrincipals?.Results?.find((sp) => sp.appId === perm);
                          return (
                            <Typography
                              variant="body2"
                              textColor="secondary"
                              key={`missing-${perm}`}
                            >
                              {sp?.displayName}:{" "}
                              {Object.keys(newPermissions?.MissingPermissions[perm]).map((type) => {
                                return (
                                  <>
                                    {newPermissions?.MissingPermissions[perm][type].length > 0 && (
                                      <React.Fragment key={`missing-${perm}-${type}`}>
                                        {type == "applicationPermissions"
                                          ? "Application"
                                          : "Delegated"}{" "}
                                        -{" "}
                                        {newPermissions?.MissingPermissions[perm][type]
                                          .map((p) => {
                                            return p.value;
                                          })
                                          .join(", ")}
                                      </React.Fragment>
                                    )}
                                  </>
                                );
                              })}
                            </Typography>
                          );
                        })}
                      </Alert>
                    </Grid>
                  </Grid>
                )}

              <Box sx={{ mt: 3 }}>
                {selectedApp &&
                  selectedApp?.length > 0 &&
                  selectedApp?.map((sp, spIndex) => (
                    <Accordion
                      expanded={expanded === sp.appId}
                      key={`accordion-item-${spIndex}-${sp?.appId}`}
                      variant="outlined"
                      onChange={handleChange(sp.appId)}
                      slotProps={{ transition: { unmountOnExit: true } }}
                    >
                      <AccordionSummary expandIcon={<ExpandMore />}>
                        <Stack
                          direction="row"
                          spacing={2}
                          justifyContent="space-between"
                          alignItems="center"
                          sx={{ width: "100%", mr: 1 }}
                        >
                          <Typography variant="h6">{sp.displayName}</Typography>
                          <Stack direction="row" spacing={2} alignItems="center">
                            <Tooltip title="Copy Application ID to clipboard">
                              <Chip
                                label={sp.appId}
                                variant="outlined"
                                size="small"
                                color="info"
                                sx={{ mr: "0.25rem", fontFamily: "monospace" }}
                                icon={
                                  <SvgIcon>
                                    <Apps />
                                  </SvgIcon>
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(sp.appId);
                                }}
                              />
                            </Tooltip>
                            <Tooltip title="Application/Delegated">
                              <Chip
                                color="info"
                                variant="outlined"
                                size="small"
                                label={getPermissionCounts(sp.appId)}
                                sx={{ width: "100px" }}
                                icon={
                                  <SvgIcon fontSize="small">
                                    <ShieldCheckIcon />
                                  </SvgIcon>
                                }
                              />
                            </Tooltip>
                            <Tooltip
                              title={
                                sp.appId === "00000003-0000-0000-c000-000000000000"
                                  ? "You can't remove Microsoft Graph"
                                  : `Remove ${sp.displayName}`
                              }
                            >
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeServicePrincipal(sp.appId);
                                }}
                              >
                                <IconButton
                                  disabled={sp.appId === "00000003-0000-0000-c000-000000000000"}
                                  color="error"
                                >
                                  <SvgIcon fontSize="small">
                                    <Delete />
                                  </SvgIcon>
                                </IconButton>
                              </div>
                            </Tooltip>
                          </Stack>
                        </Stack>
                      </AccordionSummary>
                      <AccordionDetails>
                        <ApiPermissionRow
                          servicePrincipal={sp}
                          spPermissions={newPermissions?.Permissions?.[sp.appId]}
                          formControl={formControl}
                          key={`apirow-${spIndex}`}
                        />
                      </AccordionDetails>
                    </Accordion>
                  ))}
              </Box>
            </Grid>
            <Grid size={{ xl: 12, xs: 12 }}>
              <CippApiResults apiObject={updatePermissions} />
            </Grid>
          </Grid>

          <Grid container sx={{ display: "flex", alignItems: "center" }}>
            <Grid size={{ xl: 1, xs: 12 }}>
              <Button
                variant="contained"
                startIcon={
                  <SvgIcon fontSize="small">
                    <Save />
                  </SvgIcon>
                }
                type="submit"
                disabled={updatePermissions.isPending}
                onClick={handleSubmit}
              >
                Save
              </Button>
            </Grid>
          </Grid>
        </>
      )}
      <ConfirmationDialog
        open={removePermissionDialog}
        title="Remove Service Principal"
        message="Are you sure you want to remove this service principal?"
        onConfirm={() => {
          removeServicePrincipal(spToRemove, true);
          setRemovePermissionDialog(false);
        }}
        onCancel={() => {
          setRemovePermissionDialog(false);
        }}
      />

      <ConfirmationDialog
        open={resetPermissionDialog}
        title="Reset Permissions"
        message="Are you sure you want to reset the permissions?"
        onConfirm={() => {
          confirmReset(true);
          setResetPermissionDialog(false);
        }}
        onCancel={() => {
          setResetPermissionDialog(false);
        }}
      />

      <ConfirmationDialog
        open={additionalPermissionsDialog}
        title="Additional Permissions"
        message="Some permissions are not supported in the manifest. Would you like to download them?"
        onConfirm={() => {
          var additionalBlob = new Blob([JSON.stringify(additionalPermissions, null, 2)], {
            type: "application/json",
          });
          var additionalUrl = URL.createObjectURL(additionalBlob);
          var additionalA = document.createElement("a");
          additionalA.href = additionalUrl;
          additionalA.download = "AdditionalPermissions.json";
          additionalA.click();
          URL.revokeObjectURL(additionalUrl);
          setAdditionalPermissionsDialog(false);
        }}
        onCancel={() => {
          setAdditionalPermissionsDialog(false);
        }}
      />
    </>
  );
};

export default CippAppPermissionBuilder;
