import * as core from '@actions/core'
import * as utils from './utils'
import { Context } from '@actions/github/lib/context'
import { PullRequest } from './pullrequest'
import Octokit = require('@octokit/rest')

export interface Config {
    addReviewers: boolean
    addAssignees: boolean | string
    reviewers: string[]
    assignees: string[]
    filterLabels?: {
        include?: string[]
        exclude?: string[]
    }
    numberOfAssignees: number
    numberOfReviewers: number
    titleKeywordsToSkip: string[]
    diffKeywords: string[]
    useReviewGroups: boolean
    useAssigneeGroups: boolean
    reviewGroups: { [key: string]: string[] }
    assigneeGroups: { [key: string]: string[] }
    runOnDraft?: boolean
}

export async function handlePullRequest(
    client: Octokit,
    context: Context,
    config: Config
): Promise<void> {
    if (!context.payload.pull_request) {
        throw new Error('the webhook payload is not exist')
    }

    const { title, draft, user, number } = context.payload.pull_request
    const {
        titleKeywordsToSkip,
        diffKeywords,
        useReviewGroups,
        useAssigneeGroups,
        reviewGroups,
        assigneeGroups,
        addReviewers,
        addAssignees,
        filterLabels,
        runOnDraft,
    } = config

    if (
        titleKeywordsToSkip &&
        utils.includesTitleKeywordsToSkip(title, titleKeywordsToSkip)
    ) {
        core.info(
            'Skips the process to add reviewers/assignees since PR title includes skip-keywords'
        )
        return
    }
    if (!runOnDraft && draft) {
        core.info(
            'Skips the process to add reviewers/assignees since PR type is draft'
        )
        return
    }

    if (useReviewGroups && !reviewGroups) {
        throw new Error(
            "Error in configuration file to do with using review groups. Expected 'reviewGroups' variable to be set because the variable 'useReviewGroups' = true."
        )
    }

    if (useAssigneeGroups && !assigneeGroups) {
        throw new Error(
            "Error in configuration file to do with using review groups. Expected 'assigneeGroups' variable to be set because the variable 'useAssigneeGroups' = true."
        )
    }

    const owner = user.login
    const pr = new PullRequest(client, context)

    if (
        diffKeywords &&
        !utils.diffMatchesKeywords(await pr.getDiff(), diffKeywords)
    ) {
        core.info(
            'Skips the process to add reviewers/assignees since PR diff does not includes diff-keywords'
        )
        return
    }

    if (filterLabels !== undefined) {
        if (
            filterLabels.include !== undefined &&
            filterLabels.include.length > 0
        ) {
            const hasLabels = pr.hasAnyLabel(filterLabels.include)
            if (!hasLabels) {
                core.info(
                    'Skips the process to add reviewers/assignees since PR is not tagged with any of the filterLabels.include'
                )
                return
            }
        }

        if (
            filterLabels.exclude !== undefined &&
            filterLabels.exclude.length > 0
        ) {
            const hasLabels = pr.hasAnyLabel(filterLabels.exclude)
            if (hasLabels) {
                core.info(
                    'Skips the process to add reviewers/assignees since PR is tagged with any of the filterLabels.exclude'
                )
                return
            }
        }
    }

    if (addReviewers) {
        try {
            const reviewers = utils.chooseReviewers(owner, config)

            if (reviewers.length > 0) {
                await pr.addReviewers(reviewers)
                core.info(
                    `Added reviewers to PR #${number}: ${reviewers.join(', ')}`
                )
            }
        } catch (error) {
            core.warning(error as Error)
        }
    }

    if (addAssignees) {
        try {
            const assignees = utils.chooseAssignees(owner, config)

            if (assignees.length > 0) {
                await pr.addAssignees(assignees)
                core.info(
                    `Added assignees to PR #${number}: ${assignees.join(', ')}`
                )
            }
        } catch (error) {
            core.warning(error as Error)
        }
    }
}
