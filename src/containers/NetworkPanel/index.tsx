import { useState, useEffect, useMemo } from 'react'
import RegexParser from 'regex-parser'
import { SplitPaneLayout } from '@/components/Layout'
import { onNavigate } from '@/services/networkMonitor'
import { IWebSocketNetworkRequest } from '@/hooks/useWebSocketNetworkMonitor'
import { INetworkRequest } from '@/helpers/networkHelpers'
import { NetworkTable, INetworkTableDataRow } from './NetworkTable'
import { NetworkDetails } from './NetworkDetails'
import { Toolbar } from '../Toolbar'
import WebSocketNetworkDetails from './WebSocketNetworkDetails'
import {
  IOperationFilters,
  useOperationFilters,
} from '../../hooks/useOperationFilters'
import useUserSettings from '../../hooks/useUserSettings'
import { IClearWebRequestsOptions } from '../../hooks/useNetworkMonitor'

interface NetworkPanelProps {
  selectedRowId: string | number | null
  setSelectedRowId: (selectedRowId: string | number | null) => void
  networkRequests: INetworkRequest[]
  webSocketNetworkRequests: IWebSocketNetworkRequest[]
  clearWebRequests: (opts?: IClearWebRequestsOptions) => void
}

const getRegex = (str: string) => {
  try {
    const regex = RegexParser(str)
    return { regex, errorMessage: null }
  } catch (error) {
    let message = 'Invalid Regex'
    if (error instanceof Error) message = error.message
    return { regex: null, errorMessage: message }
  }
}

const filterNetworkRequests = (
  networkRequests: INetworkRequest[],
  filterValue: string,
  options: {
    isInverted: boolean
    isRegex: boolean
    operationFilters: IOperationFilters
  }
): { results: INetworkRequest[]; errorMessage?: string } => {
  const regexResult =
    options.isRegex && filterValue ? getRegex(filterValue) : null
  if (regexResult?.errorMessage) {
    return { results: [], errorMessage: regexResult.errorMessage }
  }

  const results = networkRequests.filter((networkRequest) => {
    const { operationName = '', operation } =
      networkRequest.request.primaryOperation
    const variables = JSON.stringify(networkRequest.request.body[0]?.variables || '')

    if (!options.operationFilters[operation]) {
      return false
    }

    const isMatch = options.isRegex
      ? operationName.match(regexResult?.regex as RegExp) || variables.match(regexResult?.regex as RegExp)
      : operationName.toLowerCase().includes(filterValue.toLowerCase()) || variables.toLowerCase().includes(filterValue.toLowerCase())

    return options.isInverted ? !isMatch : isMatch
  })

  return { results }
}

export const NetworkPanel = (props: NetworkPanelProps) => {
  const {
    networkRequests,
    webSocketNetworkRequests,
    clearWebRequests,
    selectedRowId,
    setSelectedRowId,
  } = props

  const [userSettings, setUserSettings] = useUserSettings()
  const { operationFilters } = useOperationFilters()

  const { results: filteredNetworkRequests, errorMessage: filterError } =
    filterNetworkRequests(networkRequests, userSettings.filter, {
      isInverted: userSettings.isInvertFilterActive,
      isRegex: userSettings.isRegexActive,
      operationFilters,
    })

  const filteredWebsocketNetworkRequests = useMemo(() => {
    if (operationFilters.subscription) {
      return webSocketNetworkRequests
    } else {
      return []
    }
  }, [operationFilters.subscription, webSocketNetworkRequests])

  const selectedRequest = networkRequests.find(
    (request) => request.id === selectedRowId
  )

  const selectedWebSocketRequest = webSocketNetworkRequests.find(
    (request) => request.id === selectedRowId
  )

  const isRequestSelected = Boolean(selectedRequest || selectedWebSocketRequest)

  useEffect(() => {
    return onNavigate(() => {
      // When navigating to a new page, we always want to clear
      // pending requests as they could never complete once
      // the page has changed.
      //
      // We only want to clear all requests if the user has
      // disabled the preserve logs feature.
      clearWebRequests({
        clearPending: true,
        clearAll: !userSettings.isPreserveLogsActive,
      })
    })
  }, [userSettings.isPreserveLogsActive, clearWebRequests])

  const networkTableData = useMemo((): INetworkTableDataRow[] => {
    return filteredNetworkRequests.map((networkRequest) => {
      const { operationName = '', operation } =
        networkRequest.request.primaryOperation
      return {
        id: networkRequest.id,
        type: operation,
        name: operationName,
        total: networkRequest.request.body.length,
        status: networkRequest.status,
        size: networkRequest.response?.bodySize || 0,
        time: networkRequest.time,
        url: networkRequest.url,
        responseBody: networkRequest.response?.body || '',
        variables: JSON.stringify(networkRequest.request.body[0]?.variables || '')
      }
    })
  }, [filteredNetworkRequests])

  const websocketTableData = useMemo((): INetworkTableDataRow[] => {
    return filteredWebsocketNetworkRequests.map((websocketRequest) => {
      return {
        id: websocketRequest.id,
        type: 'subscription',
        name: 'subscription',
        total: 1,
        status: websocketRequest.status,
        size: 0,
        time: 0,
        url: websocketRequest.url,
        responseBody: '',
        variables: ''
      }
    })
  }, [filteredWebsocketNetworkRequests])

  const combinedTableData = useMemo(() => {
    return [...websocketTableData, ...networkTableData]
  }, [networkTableData, websocketTableData])

  return (
    <SplitPaneLayout
      header={
        <Toolbar
          filterValue={userSettings.filter}
          onFilterValueChange={(newFilter) => {
            setUserSettings({ filter: newFilter })
          }}
          preserveLogs={userSettings.isPreserveLogsActive}
          onPreserveLogsChange={(isPreserveLogsActive) => {
            setUserSettings({ isPreserveLogsActive })
          }}
          inverted={userSettings.isInvertFilterActive}
          onInvertedChange={(isInvertFilterActive) => {
            setUserSettings({ isInvertFilterActive })
          }}
          regexActive={userSettings.isRegexActive}
          onRegexActiveChange={(isRegexActive) => {
            setUserSettings({ isRegexActive })
          }}
          onClear={() => {
            setSelectedRowId(null)
            clearWebRequests()
          }}
        />
      }
      leftPane={
        <NetworkTable
          data={combinedTableData}
          error={filterError}
          selectedRowId={selectedRowId}
          onRowClick={setSelectedRowId}
          onRowSelect={setSelectedRowId}
        />
      }
      rightPane={
        isRequestSelected ? (
          <div
            className="dark:bg-gray-900 border-l border-gray-300 dark:border-gray-600 h-full"
            style={{ minWidth: 200 }}
          >
            {selectedRequest && (
              <NetworkDetails
                data={selectedRequest}
                onClose={() => {
                  setSelectedRowId(null)
                }}
              />
            )}
            {selectedWebSocketRequest && (
              <WebSocketNetworkDetails
                data={selectedWebSocketRequest}
                onClose={() => {
                  setSelectedRowId(null)
                }}
              />
            )}
          </div>
        ) : undefined
      }
    />
  )
}
