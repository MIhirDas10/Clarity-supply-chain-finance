import React from 'react';
import './PipelineTracker.css';

const stages = ['Submitted', 'Buyer Confirmed', 'Funded', 'Payout Initiated', 'Completed'];

const PipelineTracker = ({ currentStage, history }) => {
    // blue line fill
    let stageIndex = stages.indexOf(currentStage);
    let progressPercentage = 0;
    
    if (stageIndex >= 0) {
        progressPercentage = (stageIndex / (stages.length - 1)) * 100;
    }

    let renderedStages = [];

    for (let index = 0; index < stages.length; index++) {
        let stage = stages[index];
        
        let isCompleted = false;
        if (index <= stageIndex) {
            isCompleted = true;
        }

        let isCurrent = false;
        if (index === stageIndex) {
            isCurrent = true;
        }

        let stageData = null;
        if (history) {
            for (let i = 0; i < history.length; i++) {
                if (history[i].stage === stage) {
                    stageData = history[i];
                }
            }
        }

        let stageClassName = 'pipeline-stage';
        if (isCompleted) {
            stageClassName = stageClassName + ' completed';
        }
        if (isCurrent) {
            stageClassName = stageClassName + ' current';
        }

        renderedStages.push(
            <div key={stage} className={stageClassName}>
                <div className="stage-dot"></div>
                <div className="stage-name">{stage}</div>
                {stageData ? (
                    <div>
                        <div className="stage-actor">{stageData.actor}</div>
                        <div className="stage-time">{new Date(stageData.timestamp).toLocaleString()}</div>
                    </div>
                ) : null}
            </div>
        );
    }

    return (
        <div className="pipeline-tracker">
            <div className="pipeline-stages">
                <div className="pipeline-track">
                    <div className="pipeline-line-bg"></div>
                    <div className="pipeline-line-fill" style={{ width: progressPercentage + '%' }}></div>
                </div>
                {renderedStages}
            </div>
        </div>
    );
};

export default PipelineTracker;
